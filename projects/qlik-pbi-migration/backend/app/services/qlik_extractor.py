"""
Live Qlik Sense Enterprise (on-premises) metadata extraction.

Only used when DATA_SOURCE=live (see app/config.py and
docs/LIVE-EXTRACTION-SETUP.md). Produces raw dicts in exactly the same shape
as samples/qlik/qlik_apps_export.json, plus one extra field ("tables") that
the sample data doesn't have — so ingestion.py's normalization code runs
unchanged against either source.

Auth: certificate-based mutual TLS, using the client cert/key exported from
QMC (System > Certificates > Export Certificates) for both:
  - the QRS REST API (https://{server}/qrs/...)
  - the Engine API (direct WebSocket on port 4747, bypassing the proxy —
    the standard pattern for server-side automation against an on-premises
    Enterprise deployment)

Caveat: this has not been run against a live Qlik Sense server (none is
available in this environment). It follows documented QRS/Engine API
conventions, but exact QRS object-payload field names (for master items and
sheets specifically) vary slightly by Qlik Sense version — validate against
your environment and adjust `_extract_title`/`_extract_object_type` below if
your QRS response shapes differ. Core app-list and script extraction (the
fields that actually drive matching) follow the stable, well-documented
/app/full and Engine API GetScript contracts.
"""
from __future__ import annotations

import json
import random
import re
import string
from typing import Any

import httpx

try:
    import websocket  # websocket-client — only required when DATA_SOURCE=live
except ImportError:  # pragma: no cover
    websocket = None

from app.config import Settings

# ── Load-script parsing (best-effort regex, not a full script AST parser) ───

_CONNECTION_RE = re.compile(r"LIB\s+CONNECT\s+TO\s+['\"]([^'\"]+)['\"]", re.IGNORECASE)
_FROM_RE = re.compile(r"\bFROM\s+\[?([A-Za-z0-9_.$]+)\]?", re.IGNORECASE)
_RESIDENT_RE = re.compile(r"\bRESIDENT\s+\[?([A-Za-z0-9_.$]+)\]?", re.IGNORECASE)


def parse_script_for_lineage(script: str) -> tuple[list[str], list[str]]:
    """Returns (connection_names, table_names) referenced by a Qlik load
    script. Handles the common `LIB CONNECT TO '...'` and `LOAD/SELECT ...
    FROM ...` patterns. RESIDENT sources (Qlik-internal, already-loaded
    tables) are excluded from the table list since they aren't external
    tables/views. Scripts that build table/connection names dynamically
    (variables, generated LOAD) won't be caught — this enriches matching
    signals, it doesn't replace a real script parser."""
    if not script:
        return [], []
    connections = sorted(set(_CONNECTION_RE.findall(script)))
    resident = set(_RESIDENT_RE.findall(script))
    tables = sorted({t for t in _FROM_RE.findall(script) if t not in resident and t not in connections})
    return connections, tables


def _xrfkey() -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=16))


# ── QRS (Repository Service) REST client ────────────────────────────────────

class QlikQRSClient:
    def __init__(self, settings: Settings):
        if not settings.qlik_server_url:
            raise RuntimeError(
                "QLIK_SERVER_URL is not configured — see docs/LIVE-EXTRACTION-SETUP.md"
            )
        self._settings = settings
        self._client = httpx.Client(
            base_url=settings.qlik_server_url.rstrip("/"),
            cert=(settings.qlik_client_cert_path, settings.qlik_client_key_path),
            verify=settings.qlik_root_ca_path or True,
            timeout=30.0,
        )

    def _headers(self, xrfkey: str) -> dict:
        return {
            "X-Qlik-Xrfkey": xrfkey,
            "X-Qlik-User": f"UserDirectory={self._settings.qlik_user_directory};UserId={self._settings.qlik_user_id}",
            "Content-Type": "application/json",
        }

    def _get(self, path: str, params: dict | None = None) -> Any:
        xrfkey = _xrfkey()
        proxy_prefix = f"/{self._settings.qlik_virtual_proxy}" if self._settings.qlik_virtual_proxy else ""
        resp = self._client.get(
            f"{proxy_prefix}/qrs{path}",
            params={**(params or {}), "xrfkey": xrfkey},
            headers=self._headers(xrfkey),
        )
        resp.raise_for_status()
        return resp.json()

    def list_apps(self) -> list[dict]:
        """GET /qrs/app/full — the stable, documented app-list contract."""
        return self._get("/app/full")

    def list_master_items(self, app_id: str) -> list[dict]:
        """Master library items (measures/dimensions). QRS object-payload
        shape for the object name varies slightly by version — this tries
        the flat `name` field first, then falls back to `data.title`."""
        try:
            return self._get(
                "/app/object/full",
                params={"filter": f"app.id eq {app_id} and objectType eq 'masterobject'"},
            )
        except httpx.HTTPStatusError:
            return []

    def list_sheets(self, app_id: str) -> list[dict]:
        try:
            return self._get(
                "/app/object/full",
                params={"filter": f"app.id eq {app_id} and objectType eq 'sheet'"},
            )
        except httpx.HTTPStatusError:
            return []

    def close(self) -> None:
        self._client.close()


def _object_name(obj: dict) -> str:
    return obj.get("name") or (obj.get("data") or {}).get("title") or ""


def _master_item_type(obj: dict) -> str:
    """Best-effort measure-vs-dimension detection from the object's `data`
    payload (QRS doesn't expose this as a flat field). Defaults to
    'dimension' — adjust if your QRS export nests this differently."""
    data = obj.get("data") or {}
    subtype = (data.get("qMetaDef") or {}).get("subtype") or data.get("subtype") or ""
    return "measure" if "measure" in str(subtype).lower() else "dimension"


# ── Engine API — direct WebSocket connection (cert-based, bypasses proxy) ──

class QlikEngineClient:
    def __init__(self, settings: Settings, port: int = 4747):
        if websocket is None:
            raise RuntimeError(
                "websocket-client is not installed — add it to requirements.txt "
                "(only needed when DATA_SOURCE=live)"
            )
        host = settings.qlik_server_url.rstrip("/").split("://")[-1]
        self._ws = websocket.create_connection(
            f"wss://{host}:{port}/app/engineData",
            sslopt={
                "certfile": settings.qlik_client_cert_path,
                "keyfile": settings.qlik_client_key_path,
                "ca_certs": settings.qlik_root_ca_path or None,
            },
            header=[
                f"X-Qlik-User: UserDirectory={settings.qlik_user_directory}; UserId={settings.qlik_user_id}"
            ],
            timeout=30,
        )
        self._request_id = 0

    def _call(self, method: str, handle: int, params: list) -> dict:
        self._request_id += 1
        self._ws.send(
            json.dumps(
                {"jsonrpc": "2.0", "id": self._request_id, "method": method, "handle": handle, "params": params}
            )
        )
        response = json.loads(self._ws.recv())
        if "error" in response:
            raise RuntimeError(f"Engine API error calling {method}: {response['error']}")
        return response.get("result", {})

    def get_script(self, app_id: str) -> str:
        """Opens the app and returns its load script text. Requires the
        configured QRS user to have at least read access to the app."""
        opened = self._call("OpenDoc", -1, [app_id])
        doc_handle = opened["qReturn"]["qHandle"]
        script = self._call("GetScript", doc_handle, [])
        return script.get("qScript", "")

    def close(self) -> None:
        try:
            self._ws.close()
        except Exception:
            pass


# ── Orchestration ────────────────────────────────────────────────────────

def extract_qlik_apps_live(settings: Settings) -> list[dict]:
    """Returns raw app dicts shaped exactly like qlik_apps_export.json (plus
    a "tables" key). Script retrieval is best-effort per app — if the Engine
    API call fails for a given app (e.g. permissions), that app's script,
    tables, and connections-from-script are simply omitted, not faked; QRS
    metadata for that app still comes through normally."""
    qrs = QlikQRSClient(settings)
    try:
        raw_apps = qrs.list_apps()
        results = []
        for app in raw_apps:
            app_id = app["id"]
            master_items = qrs.list_master_items(app_id)
            sheets = qrs.list_sheets(app_id)

            script_connections: list[str] = []
            script_tables: list[str] = []
            try:
                engine = QlikEngineClient(settings)
                try:
                    script = engine.get_script(app_id)
                    script_connections, script_tables = parse_script_for_lineage(script)
                finally:
                    engine.close()
            except Exception:
                # Engine API session failed for this app (permissions, app
                # not reloadable, etc). Metadata-only fields still apply.
                pass

            existing_connection_names = {c["name"] for c in app.get("dataConnections", [])}
            data_connections = list(app.get("dataConnections", [])) + [
                {"id": name, "name": name}
                for name in script_connections
                if name not in existing_connection_names
            ]

            results.append(
                {
                    "id": app_id,
                    "name": app["name"],
                    "description": app.get("description", ""),
                    "owner": app.get("owner") or {},
                    "stream": app.get("stream") or {},
                    "published": app.get("published", False),
                    "publishTime": app.get("publishTime"),
                    "tags": app.get("tags", []),
                    "fileSize": app.get("fileSize"),
                    "lastReloadTime": app.get("lastReloadTime"),
                    "createdDate": app.get("createdDate"),
                    "modifiedDate": app.get("modifiedDate"),
                    "customProperties": app.get("customProperties", []),
                    "dataConnections": data_connections,
                    "masterItems": [
                        {"id": mi.get("id"), "objectType": _master_item_type(mi), "name": _object_name(mi)}
                        for mi in master_items
                    ],
                    "sheets": [{"id": s.get("id"), "objectType": "sheet", "title": _object_name(s)} for s in sheets],
                    "tables": script_tables,
                }
            )
        return results
    finally:
        qrs.close()

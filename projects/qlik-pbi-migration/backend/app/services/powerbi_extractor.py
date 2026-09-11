"""
Live Power BI metadata extraction via the Admin Scanner API.

Only used when DATA_SOURCE=live (see app/config.py and
docs/LIVE-EXTRACTION-SETUP.md). Produces a raw dict shaped exactly like
samples/powerbi/powerbi_scan_result.json ({"workspaces": [...]}) — the
Scanner API's scanResult response already matches this shape closely by
design, so ingestion.py's normalization code runs unchanged.

Auth: Azure AD service principal (client credentials flow). Requires:
  - An Azure AD app registration with a client secret
  - "Allow service principals to use Power BI Admin APIs" enabled in the
    Power BI Admin Portal, scoped to a security group containing this
    service principal
  - Tenant.Read.All (or Tenant.ReadWrite.All) API permission, admin-consented
See docs/LIVE-EXTRACTION-SETUP.md for the full setup checklist.

Caveat: this has not been run against a live Power BI tenant (none is
available in this environment). It follows the documented Scanner API scan
flow (getInfo -> poll scanStatus -> scanResult) exactly as published by
Microsoft; the auto-discovery fallback (workspaces/modified) has a lookback
window limitation noted inline below.
"""
from __future__ import annotations

import re
import time
from typing import Any

import httpx

from app.config import Settings

_AUTH_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
_API_BASE = "https://api.powerbi.com/v1.0/myorg/admin"
_SCOPE = "https://analysis.windows.net/powerbi/api/.default"

# Best-effort extraction of the source table/view referenced by a Power
# Query M expression, e.g. `Source{[Schema="dbo",Item="SalesFact"]}` or
# `Sql.Database(server, database){[Item="SalesFact"]}`. Not a full M parser —
# handles the common Item=/Table= patterns produced by the Power Query UI.
_M_ITEM_RE = re.compile(r'(?:Item|Table)\s*=\s*"([^"]+)"')


def parse_m_expression_for_tables(expression: str) -> list[str]:
    if not expression:
        return []
    return sorted(set(_M_ITEM_RE.findall(expression)))


def _get_access_token(settings: Settings) -> str:
    if not (settings.pbi_tenant_id and settings.pbi_client_id and settings.pbi_client_secret):
        raise RuntimeError(
            "PBI_TENANT_ID / PBI_CLIENT_ID / PBI_CLIENT_SECRET are not fully configured — "
            "see docs/LIVE-EXTRACTION-SETUP.md"
        )
    resp = httpx.post(
        _AUTH_URL.format(tenant=settings.pbi_tenant_id),
        data={
            "grant_type": "client_credentials",
            "client_id": settings.pbi_client_id,
            "client_secret": settings.pbi_client_secret,
            "scope": _SCOPE,
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _discover_workspace_ids(client: httpx.Client) -> list[str]:
    """Fallback when PBI_WORKSPACE_IDS is left blank. Only returns workspaces
    modified within the API's lookback window (~30 days by default) — for a
    complete inventory, prefer setting PBI_WORKSPACE_IDS explicitly (e.g.
    seeded once from a full /admin/groups listing)."""
    resp = client.get(f"{_API_BASE}/workspaces/modified", params={"excludePersonalWorkspaces": "true"})
    resp.raise_for_status()
    return [ws["id"] for ws in resp.json()]


def _run_scan(client: httpx.Client, workspace_ids: list[str]) -> dict:
    resp = client.post(
        f"{_API_BASE}/workspaces/getInfo",
        params={
            "datasetSchema": "true",
            "datasetExpressions": "true",
            "datasourceDetails": "true",
            "lineage": "true",
        },
        json={"workspaces": workspace_ids},
    )
    resp.raise_for_status()
    scan_id = resp.json()["id"]

    for _ in range(60):  # up to ~2 minutes; large tenants may need a longer/backoff loop
        status_resp = client.get(f"{_API_BASE}/workspaces/scanStatus/{scan_id}")
        status_resp.raise_for_status()
        status = status_resp.json().get("status")
        if status == "Succeeded":
            break
        if status == "Failed":
            raise RuntimeError(f"Power BI scan {scan_id} failed")
        time.sleep(2)
    else:
        raise RuntimeError(f"Power BI scan {scan_id} did not complete in time")

    result_resp = client.get(f"{_API_BASE}/workspaces/scanResult/{scan_id}")
    result_resp.raise_for_status()
    return result_resp.json()


def _enrich_tables_with_m_lineage(scan_result: dict) -> None:
    """Adds a `sourceTables` key (parsed from the M expression, when present)
    to each table dict, in place. Not yet consumed by ingestion.py/PowerBIApp
    — this is forward-looking enrichment for table/view-level lineage
    matching, kept separate from the existing schema-derived `tables` field
    so nothing downstream changes shape unexpectedly."""
    for ws in scan_result.get("workspaces", []):
        for ds in ws.get("datasets", []):
            for table in ds.get("tables", []):
                sources = table.get("source", []) or []
                referenced = []
                for src in sources:
                    referenced.extend(parse_m_expression_for_tables(src.get("expression", "")))
                if referenced:
                    table["sourceTables"] = sorted(set(referenced))


def extract_pbi_apps_live(settings: Settings) -> dict:
    """Returns a raw dict shaped exactly like powerbi_scan_result.json."""
    token = _get_access_token(settings)
    with httpx.Client(headers={"Authorization": f"Bearer {token}"}, timeout=60.0) as client:
        workspace_ids = (
            [w.strip() for w in settings.pbi_workspace_ids.split(",") if w.strip()]
            if settings.pbi_workspace_ids
            else _discover_workspace_ids(client)
        )
        if not workspace_ids:
            return {"workspaces": []}

        scan_result = _run_scan(client, workspace_ids)
        _enrich_tables_with_m_lineage(scan_result)
        return scan_result

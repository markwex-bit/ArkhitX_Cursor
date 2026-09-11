"""
Stage: Ingestion / normalization.

Parses raw QRS / Scanner-API-shaped JSON into the normalized catalog models.
Two sources are supported, selected by Settings.data_source:

  - "sample" (default) — reads samples/*.json. No live API calls happen.
  - "live" — calls the real Qlik/Power BI admin APIs (services/qlik_extractor.py,
    services/powerbi_extractor.py) and normalizes their output instead.

Both paths produce identical raw shapes, so the normalization logic below
(_normalize_qlik_apps / _normalize_pbi_apps) runs unchanged either way —
switching DATA_SOURCE=live means pointing at real API responses, nothing
downstream (eligibility, quality, matching) changes. See
docs/LIVE-EXTRACTION-SETUP.md for how to configure live extraction.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.config import get_settings
from app.models.catalog import PowerBIApp, QlikApp

# projects/qlik-pbi-migration/backend/app/services/ingestion.py -> project root
PROJECT_ROOT = Path(__file__).resolve().parents[3]
SAMPLES_DIR = PROJECT_ROOT / "samples"


def _connection_identifier(conn: dict) -> str:
    """Best-effort normalized identifier for a Power BI datasourceUsage entry."""
    details = conn.get("connectionDetails", {}) or {}
    return (
        details.get("database")
        or details.get("path")
        or details.get("url")
        or details.get("server")
        or ""
    )


def _normalize_qlik_apps(raw_apps: list[dict]) -> list[QlikApp]:
    apps = []
    for raw in raw_apps:
        apps.append(
            QlikApp(
                id=raw["id"],
                name=raw["name"],
                description=raw.get("description", ""),
                stream=(raw.get("stream") or {}).get("name", ""),
                owner=(raw.get("owner") or {}).get("name", ""),
                tags=[t["name"] for t in raw.get("tags", [])],
                last_reload_time=raw.get("lastReloadTime"),
                data_connections=[c["name"] for c in raw.get("dataConnections", [])],
                measures=[
                    m["name"]
                    for m in raw.get("masterItems", [])
                    if m.get("objectType") == "measure"
                ],
                dimensions=[
                    m["name"]
                    for m in raw.get("masterItems", [])
                    if m.get("objectType") == "dimension"
                ],
                sheets=[s["title"] for s in raw.get("sheets", [])],
                # Only populated when DATA_SOURCE=live and the app's load
                # script could be parsed (see qlik_extractor.py). Sample data
                # has no equivalent field, so this defaults to [].
                tables=raw.get("tables", []),
            )
        )
    return apps


def _normalize_pbi_apps(data: dict) -> list[PowerBIApp]:
    apps = []
    for ws in data["workspaces"]:
        reports_by_dataset = {r["datasetId"]: r for r in ws.get("reports", [])}
        for ds in ws.get("datasets", []):
            report = reports_by_dataset.get(ds["id"])
            refresh = ds.get("refreshSchedule")
            endorsement = ds.get("endorsementDetails")
            sensitivity = ds.get("sensitivityLabel")

            apps.append(
                PowerBIApp(
                    dataset_id=ds["id"],
                    report_id=report["id"] if report else None,
                    name=ds["name"],
                    description=ds.get("description", ""),
                    workspace_id=ws["id"],
                    workspace_name=ws["name"],
                    workspace_type=ws["type"],
                    tables=[t["name"] for t in ds.get("tables", [])],
                    measures=[m["name"] for m in ds.get("measures", [])],
                    datasource_connections=[
                        _connection_identifier(c) for c in ds.get("datasourceUsages", [])
                    ],
                    last_refresh_time=refresh.get("lastRefreshTime") if refresh else None,
                    refresh_enabled=refresh.get("enabled") if refresh else None,
                    has_refresh_schedule=refresh is not None,
                    endorsement=endorsement.get("endorsement") if endorsement else None,
                    sensitivity_label=sensitivity.get("displayName") if sensitivity else None,
                    has_report=report is not None,
                )
            )
    return apps


def _load_raw_qlik_apps() -> list[dict]:
    settings = get_settings()
    if settings.data_source == "live":
        from app.services.qlik_extractor import extract_qlik_apps_live

        return extract_qlik_apps_live(settings)
    path = SAMPLES_DIR / "qlik" / "qlik_apps_export.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _load_raw_pbi_data() -> dict:
    settings = get_settings()
    if settings.data_source == "live":
        from app.services.powerbi_extractor import extract_pbi_apps_live

        return extract_pbi_apps_live(settings)
    path = SAMPLES_DIR / "powerbi" / "powerbi_scan_result.json"
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache
def load_qlik_apps() -> list[QlikApp]:
    return _normalize_qlik_apps(_load_raw_qlik_apps())


@lru_cache
def load_pbi_apps() -> list[PowerBIApp]:
    return _normalize_pbi_apps(_load_raw_pbi_data())

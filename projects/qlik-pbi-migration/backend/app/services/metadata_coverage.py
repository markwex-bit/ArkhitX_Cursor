"""Metadata field coverage — % of apps with each checklist field populated."""
from __future__ import annotations

from app.models.catalog import MetadataCoverageReport, MetadataFieldStat, PowerBIApp, QlikApp

# Keys align with DATA-REQUEST-CHECKLIST.md tiers (must_have vs high_value).

PBI_FIELDS: list[tuple[str, str, str]] = [
    ("dataset_id", "Dataset id + name", "must_have"),
    ("workspace_type", "Workspace type (Workspace vs PersonalGroup)", "must_have"),
    ("datasource_connections", "Datasource usages / connections", "must_have"),
    ("tables", "Table + column schema", "must_have"),
    ("measures", "Measure names", "must_have"),
    ("refresh_metadata", "Refresh schedule or last refresh time", "must_have"),
    ("has_report", "Report bound to dataset", "must_have"),
    ("description", "Description", "high_value"),
    ("endorsement", "Endorsement (certified/promoted)", "high_value"),
    ("sensitivity_label", "Sensitivity label", "high_value"),
]

QLIK_FIELDS: list[tuple[str, str, str]] = [
    ("identity", "App id + name", "must_have"),
    ("owner_stream", "Owner + stream", "must_have"),
    ("data_connections", "Data connection names", "must_have"),
    ("master_items", "Measures or dimensions", "must_have"),
    ("last_reload", "Last reload time", "must_have"),
    ("description", "Description", "must_have"),
    ("tags", "Tags", "must_have"),
    ("sheets", "Sheet titles", "high_value"),
    ("tables", "Tables from script parse", "high_value"),
]


def _pct(present: int, total: int) -> float:
    if total == 0:
        return 0.0
    return round(100.0 * present / total, 1)


def _pbi_field_present(app: PowerBIApp, key: str) -> bool:
    if key == "dataset_id":
        return bool(app.dataset_id and app.name)
    if key == "workspace_type":
        return bool(app.workspace_type)
    if key == "datasource_connections":
        return len(app.datasource_connections) > 0
    if key == "tables":
        return len(app.tables) > 0
    if key == "measures":
        return len(app.measures) > 0
    if key == "refresh_metadata":
        return app.has_refresh_schedule or bool(app.last_refresh_time)
    if key == "has_report":
        return app.has_report
    if key == "description":
        return bool(app.description)
    if key == "endorsement":
        return bool(app.endorsement)
    if key == "sensitivity_label":
        return bool(app.sensitivity_label)
    return False


def _qlik_field_present(app: QlikApp, key: str) -> bool:
    if key == "identity":
        return bool(app.id and app.name)
    if key == "owner_stream":
        return bool(app.owner and app.stream)
    if key == "data_connections":
        return len(app.data_connections) > 0
    if key == "master_items":
        return len(app.measures) > 0 or len(app.dimensions) > 0
    if key == "last_reload":
        return bool(app.last_reload_time)
    if key == "description":
        return bool(app.description)
    if key == "tags":
        return len(app.tags) > 0
    if key == "sheets":
        return len(app.sheets) > 0
    if key == "tables":
        return len(app.tables) > 0
    return False


def _build_report(
    platform: str,
    total: int,
    field_defs: list[tuple[str, str, str]],
    checker,
    apps,
) -> MetadataCoverageReport:
    fields: list[MetadataFieldStat] = []
    for key, label, tier in field_defs:
        present = sum(1 for app in apps if checker(app, key))
        fields.append(
            MetadataFieldStat(
                field_key=key,
                label=label,
                tier=tier,
                present_count=present,
                total=total,
                pct=_pct(present, total),
            )
        )
    return MetadataCoverageReport(platform=platform, total_apps=total, fields=fields)


def evaluate_coverage(
    qlik_apps: list[QlikApp],
    pbi_apps: list[PowerBIApp],
) -> list[MetadataCoverageReport]:
    return [
        _build_report("Qlik Sense", len(qlik_apps), QLIK_FIELDS, _qlik_field_present, qlik_apps),
        _build_report("Power BI", len(pbi_apps), PBI_FIELDS, _pbi_field_present, pbi_apps),
    ]

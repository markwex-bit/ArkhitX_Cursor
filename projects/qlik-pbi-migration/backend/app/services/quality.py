"""
Stage 0b — Qlik inventory quality pass, plus the cross-platform capability
parity matrix. Deterministic; no LLM involved. See docs/DATA-SCHEMAS.md for
why the parity matrix rows are what they are (Qlik QRS vs. Power BI Scanner
API — a real, documented platform asymmetry, not a data-entry problem).
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.models.catalog import ParityRow, QlikApp, QlikQualityResult

STALE_DAYS_THRESHOLD = 180


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def evaluate_qlik_quality(apps: list[QlikApp], now: datetime | None = None) -> list[QlikQualityResult]:
    now = now or datetime.now(timezone.utc)
    results = []

    for app in apps:
        flags: list[str] = []
        score = 1.0

        if not app.description:
            flags.append("missing_description")
            score -= 0.25
        if not app.tags:
            flags.append("missing_tags")
            score -= 0.10
        if not app.data_connections:
            flags.append("no_data_connection_identified")
            score -= 0.25
        if not app.measures and not app.dimensions:
            flags.append("no_master_items_captured")
            score -= 0.20
        if not app.sheets:
            flags.append("no_sheet_titles_captured")
            score -= 0.10

        last_reload = _parse_ts(app.last_reload_time)
        if last_reload:
            age_days = (now - last_reload).days
            if age_days > STALE_DAYS_THRESHOLD:
                flags.append(f"stale_reload_{age_days}_days")
                score -= 0.20
        else:
            flags.append("no_reload_time_captured")
            score -= 0.15

        results.append(
            QlikQualityResult(
                app_id=app.id,
                name=app.name,
                completeness_score=max(0.0, round(score, 2)),
                flags=flags,
            )
        )
    return results


PARITY_MATRIX: list[ParityRow] = [
    ParityRow(
        capability="Table/column-level lineage",
        qlik="No (via QRS)",
        power_bi="Yes",
        note="Qlik requires the Engine API for load-script lineage; QRS only exposes app-level metadata. This sample uses data-connection *names* as a best-effort proxy — see docs/DATA-SCHEMAS.md.",
    ),
    ParityRow(
        capability="Measure / DAX expression",
        qlik="Partial (name only)",
        power_bi="Yes (full DAX)",
        note="Qlik master-item names are exposed via QRS; expressions are not without the Engine API. Power BI Scanner API returns full DAX when datasetExpressions=true.",
    ),
    ParityRow(
        capability="Sheet / visual content",
        qlik="Partial (titles only)",
        power_bi="Yes (report structure)",
        note="Qlik sheet titles are available via QRS; visual layout is not.",
    ),
    ParityRow(
        capability="Row-level security (RLS)",
        qlik="No (via QRS)",
        power_bi="Yes",
        note="Power BI Scanner API (2023+ extension) returns RLS role info; QRS exposes no equivalent.",
    ),
    ParityRow(
        capability="Sensitivity labels",
        qlik="No",
        power_bi="Yes",
        note="Microsoft Purview sensitivity labels are Power BI/Fabric-native; Qlik has no direct equivalent field.",
    ),
    ParityRow(
        capability="Certification / endorsement tier",
        qlik="No direct equivalent",
        power_bi="Yes (Certified/Promoted)",
        note="Qlik uses streams for publishing/visibility, which is a different concept from a certification tier.",
    ),
    ParityRow(
        capability="Refresh / reload timestamp",
        qlik="Yes (lastReloadTime)",
        power_bi="Yes (refreshSchedule)",
        note="Both platforms expose this, in different shapes — used directly for staleness checks on both sides.",
    ),
    ParityRow(
        capability="Usage / activity metrics",
        qlik="Not in this sample",
        power_bi="Not in this sample",
        note="Both platforms support this via a separate audit/activity API call, intentionally excluded from this sample to keep scope tight.",
    ),
]


def get_parity_matrix() -> list[ParityRow]:
    return PARITY_MATRIX

"""
Stage 0a — Power BI eligibility filtering.

Deterministic, standalone, no Qlik data involved. Every Power BI app gets zero
or more exclusion reason codes derived purely from structured metadata. This
is what shrinks a real 75,000-app estate down to a clean, canonical candidate
pool before anything ever gets compared to Qlik. See the "Deterministic vs.
AI-agent boundary" section of the project plan — nothing here uses an LLM.
"""
from __future__ import annotations

import difflib
import re
from datetime import datetime, timezone

from app.models.catalog import EligibilityResult, EligibilitySummary, PowerBIApp

STALE_DAYS_THRESHOLD = 180
# Matched against the name with underscores/parens normalized to spaces first
# (see _is_test_or_sandbox_name) so "Marketing_Test_Report" and "Foo (Copy)"
# both match the word-bounded alternatives below.
TEST_NAME_PATTERN = re.compile(r"(?i)\b(test|sandbox|poc|temp|copy of|copy|v0)\b")


def _is_test_or_sandbox_name(name: str) -> bool:
    normalized = re.sub(r"[_()]", " ", name)
    return bool(TEST_NAME_PATTERN.search(normalized))

# Near-duplicate detection thresholds — tuned for readability on the sample
# data, not statistically optimized. At real scale these would run against a
# much larger corpus and likely need re-tuning / a proper blocking library.
DUP_NAME_SIMILARITY_THRESHOLD = 0.45
DUP_TABLE_OVERLAP_THRESHOLD = 0.3


def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _quality_score(app: PowerBIApp) -> int:
    """Higher score = better canonical candidate within a duplicate cluster."""
    score = 0
    if app.description:
        score += 2
    if app.endorsement:
        score += 2
    if app.has_refresh_schedule and app.refresh_enabled:
        score += 1
    if app.has_report:
        score += 1
    return score


def evaluate_eligibility(apps: list[PowerBIApp], now: datetime | None = None) -> EligibilitySummary:
    now = now or datetime.now(timezone.utc)

    per_app_reasons: dict[str, list[str]] = {}
    per_app_quality_flags: dict[str, list[str]] = {}
    apps_by_id = {a.dataset_id: a for a in apps}

    for app in apps:
        reasons: list[str] = []
        quality_flags: list[str] = []

        if app.workspace_type == "PersonalGroup":
            reasons.append("personal_workspace")
        if _is_test_or_sandbox_name(app.name):
            reasons.append("test_or_sandbox_name")
        if not app.has_report:
            reasons.append("orphaned_dataset")
        if not app.datasource_connections:
            reasons.append("broken_lineage")

        last_refresh = _parse_ts(app.last_refresh_time)
        if last_refresh and (now - last_refresh).days > STALE_DAYS_THRESHOLD:
            reasons.append("stale")

        # Missing refresh metadata is a QUALITY flag, not a hard exclusion —
        # it means "we can't tell if this is stale," which is a different,
        # more honest claim than "this is definitely stale."
        if not app.has_refresh_schedule:
            quality_flags.append("missing_refresh_metadata")
        if not app.description:
            quality_flags.append("missing_description")
        if not app.endorsement:
            quality_flags.append("not_endorsed")

        per_app_reasons[app.dataset_id] = reasons
        per_app_quality_flags[app.dataset_id] = quality_flags

    # Near-duplicate clustering: name similarity + shared-table overlap.
    duplicate_of: dict[str, str] = {}
    n = len(apps)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = apps[i], apps[j]
            name_sim = difflib.SequenceMatcher(
                None, _normalize_name(a.name), _normalize_name(b.name)
            ).ratio()
            tables_a, tables_b = set(a.tables), set(b.tables)
            table_overlap = (
                len(tables_a & tables_b) / len(tables_a | tables_b)
                if (tables_a or tables_b)
                else 0.0
            )
            if name_sim >= DUP_NAME_SIMILARITY_THRESHOLD and table_overlap >= DUP_TABLE_OVERLAP_THRESHOLD:
                cluster_ids = {a.dataset_id, b.dataset_id}
                cluster_ids.update(k for k, v in duplicate_of.items() if v in cluster_ids)
                canonical = max(cluster_ids, key=lambda cid: _quality_score(apps_by_id[cid]))
                for cid in cluster_ids:
                    if cid != canonical:
                        duplicate_of[cid] = canonical

    results: list[EligibilityResult] = []
    by_reason: dict[str, int] = {}

    for app in apps:
        reasons = list(per_app_reasons[app.dataset_id])
        if app.dataset_id in duplicate_of:
            reasons.append(f"duplicate_of:{duplicate_of[app.dataset_id]}")

        eligible = len(reasons) == 0
        for r in reasons:
            key = "duplicate" if r.startswith("duplicate_of:") else r
            by_reason[key] = by_reason.get(key, 0) + 1

        results.append(
            EligibilityResult(
                dataset_id=app.dataset_id,
                name=app.name,
                workspace_name=app.workspace_name,
                eligible=eligible,
                exclusion_reasons=reasons,
                quality_flags=per_app_quality_flags[app.dataset_id],
            )
        )

    excluded = sum(1 for r in results if not r.eligible)
    return EligibilitySummary(
        total=len(results),
        eligible_count=len(results) - excluded,
        excluded_count=excluded,
        by_reason=by_reason,
        results=results,
    )


def eligible_pbi_apps(apps: list[PowerBIApp], summary: EligibilitySummary | None = None) -> list[PowerBIApp]:
    """Returns only the clean, canonical pool that should ever reach matching."""
    summary = summary or evaluate_eligibility(apps)
    eligible_ids = {r.dataset_id for r in summary.results if r.eligible}
    return [a for a in apps if a.dataset_id in eligible_ids]

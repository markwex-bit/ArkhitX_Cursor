"""
Stage 0b (qualification) — Qlik apps in scope for matching.

Mirrors Power BI eligibility: deterministic good vs excluded counts with reasons.
Uses completeness scores from quality.evaluate_qlik_quality().
"""
from __future__ import annotations

from app.models.catalog import QlikApp, QlikQualityResult, QlikQualificationResult, QlikQualificationSummary

COMPLETENESS_THRESHOLD = 0.5


def _exclusion_reasons(score: float, flags: list[str]) -> list[str]:
    reasons: list[str] = []
    if score < COMPLETENESS_THRESHOLD:
        reasons.append("below_completeness_threshold")
    for flag in flags:
        if flag == "no_data_connection_identified":
            reasons.append("no_data_connection_identified")
        elif flag == "no_master_items_captured":
            reasons.append("no_master_items_captured")
        elif flag.startswith("stale_reload"):
            reasons.append("stale_reload")
    return reasons


def evaluate_qlik_qualification(
    apps: list[QlikApp],
    quality_results: list[QlikQualityResult],
) -> QlikQualificationSummary:
    quality_by_id = {q.app_id: q for q in quality_results}
    results: list[QlikQualificationResult] = []
    by_reason: dict[str, int] = {}

    for app in apps:
        q = quality_by_id[app.id]
        exclusion = _exclusion_reasons(q.completeness_score, q.flags)
        qualified = len(exclusion) == 0
        for r in exclusion:
            by_reason[r] = by_reason.get(r, 0) + 1

        non_excluding_flags = [
            f
            for f in q.flags
            if f
            not in (
                "no_data_connection_identified",
                "no_master_items_captured",
            )
            and not f.startswith("stale_reload")
        ]

        results.append(
            QlikQualificationResult(
                app_id=app.id,
                name=app.name,
                qualified=qualified,
                completeness_score=q.completeness_score,
                exclusion_reasons=exclusion,
                quality_flags=non_excluding_flags,
            )
        )

    excluded = sum(1 for r in results if not r.qualified)
    qualified = len(results) - excluded
    total = len(results)
    return QlikQualificationSummary(
        total=total,
        qualified_count=qualified,
        excluded_count=excluded,
        qualified_pct=round(100.0 * qualified / total, 1) if total else 0.0,
        excluded_pct=round(100.0 * excluded / total, 1) if total else 0.0,
        by_reason=by_reason,
        completeness_threshold=COMPLETENESS_THRESHOLD,
        results=results,
    )


def qualified_qlik_apps(
    apps: list[QlikApp],
    summary: QlikQualificationSummary,
) -> list[QlikApp]:
    qualified_ids = {r.app_id for r in summary.results if r.qualified}
    return [a for a in apps if a.id in qualified_ids]

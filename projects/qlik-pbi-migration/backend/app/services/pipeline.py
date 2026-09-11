"""
Orchestrates the full staged pipeline described in the project plan:

  PBI raw -> eligibility filter -> clean PBI pool  ---\\
                                                        +--> candidate generation (blocking)
  Qlik raw -> quality pass -> scored Qlik inventory --/         |
                                                                  v
                                          semantic match (LLM, narrowed set only)
                                                                  |
                                                                  v
                                          confidence tiering (already computed in matching.py)
                                                                  |
                                                                  v
                                          migration advisor (LLM, grounded in the above)

Human sign-off (services/signoff.py) happens outside this module, in the API
layer, and is never bypassed.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any

from app.agents.migration_advisor_agent import MigrationAdvisorAgent
from app.agents.semantic_match_agent import SemanticMatchAgent
from app.models.catalog import (
    Disposition,
    EligibilitySummary,
    MatchCandidate,
    ParityRow,
    QlikApp,
    QlikDispositionResult,
    QlikQualityResult,
)
from app.services import eligibility, ingestion, matching, quality

# Only run the (relatively expensive, real-API-calling) semantic match + advisor
# agents on this many top candidates per Qlik app, to keep the demo fast and
# cheap. At production scale this number would be tuned against the blocking
# stage's precision, not raised indiscriminately.
SEMANTIC_MATCH_TOP_N = 2


class PipelineResult:
    def __init__(
        self,
        eligibility_summary: EligibilitySummary,
        qlik_quality: list[QlikQualityResult],
        parity_matrix: list[ParityRow],
        dispositions: list[QlikDispositionResult],
    ):
        self.eligibility_summary = eligibility_summary
        self.qlik_quality = qlik_quality
        self.parity_matrix = parity_matrix
        self.dispositions = dispositions


def _run_semantic_match(qapp: QlikApp, candidate: MatchCandidate, papp_lookup: dict) -> None:
    papp = papp_lookup[candidate.pbi_dataset_id]
    agent = SemanticMatchAgent()
    result = agent.process(
        {
            "qlik": qapp.model_dump(),
            "pbi": papp.model_dump(),
            "signals": {
                "lineage_match": candidate.lineage_match,
                "lineage_signal": candidate.lineage_signal,
                "name_similarity": candidate.name_similarity,
                "measure_overlap": candidate.measure_overlap,
                "signals_available": candidate.signals_available,
                "signals_missing": candidate.signals_missing,
            },
        }
    )
    candidate.llm_used = result["llm_used"]
    candidate.semantic_score = result["semantic_score"]
    candidate.semantic_rationale = result["rationale"]
    candidate.matched_concepts = result["matched_concepts"]
    candidate.unmatched_concepts = result["unmatched_concepts"]


def _run_advisor(qapp: QlikApp, qlik_quality_flags: list[str], best_candidate: MatchCandidate | None) -> dict[str, Any]:
    agent = MigrationAdvisorAgent()
    candidate_dict = None
    if best_candidate:
        candidate_dict = {
            "pbi_name": best_candidate.pbi_name,
            "pbi_workspace_name": best_candidate.pbi_workspace_name,
            "confidence_tier": best_candidate.confidence_tier.value,
            "lineage_match": best_candidate.lineage_match,
            "lineage_signal": best_candidate.lineage_signal,
            "name_similarity": best_candidate.name_similarity,
            "measure_overlap": best_candidate.measure_overlap,
            "signals_missing": best_candidate.signals_missing,
            "semantic_used_llm": best_candidate.llm_used,
            "semantic_score": best_candidate.semantic_score,
            "matched_concepts": best_candidate.matched_concepts,
            "unmatched_concepts": best_candidate.unmatched_concepts,
        }
    return agent.process(
        {
            "qlik_name": qapp.name,
            "qlik_quality_flags": qlik_quality_flags,
            "best_candidate": candidate_dict,
        }
    )


def run_pipeline(use_llm: bool = True) -> PipelineResult:
    qlik_apps = ingestion.load_qlik_apps()
    pbi_apps = ingestion.load_pbi_apps()

    elig_summary = eligibility.evaluate_eligibility(pbi_apps)
    clean_pool = eligibility.eligible_pbi_apps(pbi_apps, elig_summary)
    papp_lookup = {a.dataset_id: a for a in clean_pool}

    qlik_quality = quality.evaluate_qlik_quality(qlik_apps)
    qlik_quality_by_id = {q.app_id: q for q in qlik_quality}

    candidates_by_qlik = matching.generate_candidates(qlik_apps, clean_pool)

    dispositions: list[QlikDispositionResult] = []
    for qapp in qlik_apps:
        candidates = candidates_by_qlik.get(qapp.id, [])

        if use_llm:
            for candidate in candidates[:SEMANTIC_MATCH_TOP_N]:
                _run_semantic_match(qapp, candidate, papp_lookup)

        best_candidate = candidates[0] if candidates else None
        qflags = qlik_quality_by_id[qapp.id].flags

        if use_llm:
            advisor_result = _run_advisor(qapp, qflags, best_candidate)
            disposition_value = advisor_result.get("disposition")
            try:
                disposition = Disposition(disposition_value)
            except ValueError:
                disposition = Disposition.REBUILD if not best_candidate else Disposition.EXTEND
            if best_candidate:
                best_candidate.disposition = disposition
                best_candidate.effort = advisor_result.get("effort")
                best_candidate.advisor_rationale = advisor_result.get("rationale")
        else:
            disposition = None

        dispositions.append(
            QlikDispositionResult(
                qlik_app_id=qapp.id,
                qlik_app_name=qapp.name,
                candidates=candidates,
                disposition=disposition,
            )
        )

    return PipelineResult(
        eligibility_summary=elig_summary,
        qlik_quality=qlik_quality,
        parity_matrix=quality.get_parity_matrix(),
        dispositions=dispositions,
    )


@lru_cache
def run_pipeline_cached(use_llm: bool = True) -> PipelineResult:
    """LLM calls are real API calls with real latency/cost — cache the result
    for the lifetime of the process so the UI doesn't re-trigger them on
    every page load. Call ingestion.load_*.cache_clear() + this function's
    .cache_clear() to force a refresh."""
    return run_pipeline(use_llm=use_llm)

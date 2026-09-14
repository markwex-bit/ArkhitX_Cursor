"""
Stage 2 — Semantic matching (LLM), only ever run on candidates that already
survived deterministic blocking (see services/matching.py).
"""
from __future__ import annotations

from typing import Any

from arkhitx import GovernedBaseAgent

from app.governance.arkhitx_client import get_arkhitx_client


class SemanticMatchAgent(GovernedBaseAgent):
    agent_id = "semantic-match"

    def __init__(self):
        super().__init__(arkhitx=get_arkhitx_client())

    def _default_system_prompt(self) -> str:
        return """You are a BI migration analyst comparing a Qlik Sense application to a \
candidate Power BI dataset/report to judge whether they answer the same business question.

You are given structured facts only — names, descriptions, measure/dimension names, sheet \
titles, and which deterministic signals (lineage overlap, name similarity, measure overlap) \
were already computed. You do NOT have access to the actual visual layout, calculation logic, \
or DAX/load-script expressions, so be explicit about uncertainty where names are ambiguous.

Respond with a JSON object with exactly these keys:
- "semantic_score": integer 0-100, how likely these two serve the same business purpose
- "matched_concepts": array of short strings — business concepts that appear to align (e.g. "revenue tracking by region")
- "unmatched_concepts": array of short strings — things present on one side with no clear counterpart on the other
- "rationale": 2-3 sentence plain-English explanation a BI admin could show to a business stakeholder

Do not invent facts not present in the input. If information is insufficient to judge, say so \
in the rationale and score conservatively (below 50)."""

    def _grounding_query(self, user_message: str) -> dict | None:
        return {
            "retrieval_strategy": "graph",
            "entity_type": "QlikApp",
            "depth": 2,
            "stage": "Semantic Match",
            "process_group": "Migration Assessor Pipeline",
        }

    def process(self, data: dict[str, Any]) -> dict[str, Any]:
        qlik = data["qlik"]
        pbi = data["pbi"]
        signals = data["signals"]

        user_message = f"""## Qlik Sense App
Name: {qlik['name']}
Description: {qlik.get('description') or '(none captured)'}
Stream: {qlik.get('stream') or '(none)'}
Sheet titles: {', '.join(qlik.get('sheets', [])) or '(none captured)'}
Measures: {', '.join(qlik.get('measures', [])) or '(none captured)'}
Dimensions: {', '.join(qlik.get('dimensions', [])) or '(none captured)'}

## Power BI Candidate
Name: {pbi['name']}
Workspace: {pbi.get('workspace_name') or '(unknown)'}
Description: {pbi.get('description') or '(none captured)'}
Tables: {', '.join(pbi.get('tables', [])) or '(none captured)'}
Measures: {', '.join(pbi.get('measures', [])) or '(none captured)'}

## Deterministic signals already computed
Lineage match (shared data connection): {signals['lineage_match']} — {signals['lineage_signal']}
Name similarity (0-1): {signals['name_similarity']}
Measure/dimension text overlap (0-1): {signals['measure_overlap']}
Signals available: {', '.join(signals.get('signals_available', [])) or '(none)'}
Signals missing: {', '.join(signals.get('signals_missing', [])) or '(none)'}

Judge business-intent equivalence given the above."""

        try:
            result = self.call_llm_json(user_message)
            return {
                "llm_used": True,
                "semantic_score": int(result.get("semantic_score", 0)),
                "matched_concepts": result.get("matched_concepts", []),
                "unmatched_concepts": result.get("unmatched_concepts", []),
                "rationale": result.get("rationale", ""),
            }
        except Exception as exc:  # noqa: BLE001 - deliberate broad catch for graceful degradation
            return {
                "llm_used": False,
                "semantic_score": None,
                "matched_concepts": [],
                "unmatched_concepts": [],
                "rationale": (
                    "LLM semantic match unavailable "
                    f"({type(exc).__name__}: {exc}). Falling back to deterministic "
                    "signals only — this is NOT an AI judgment, treat as insufficient "
                    "evidence for a High-confidence disposition."
                ),
            }

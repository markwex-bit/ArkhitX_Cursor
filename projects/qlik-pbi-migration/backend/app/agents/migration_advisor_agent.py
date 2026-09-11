"""
Stage 3/5 — Migration advisory (LLM), grounded in the deterministic
confidence tier and quality flags, plus the semantic match result if one
exists. This agent NEVER produces the final decision on its own — its output
always still requires the human sign-off gate (see services/signoff.py)
before anything reaches the migration backlog.
"""
from __future__ import annotations

from typing import Any

from app.agents.base_agent import BaseAgent


class MigrationAdvisorAgent(BaseAgent):
    def get_system_prompt(self) -> str:
        return """You are a BI migration advisor recommending what to do with a Qlik Sense \
application that is being sunset, given zero or more candidate Power BI replacements.

You are given deterministic facts (confidence tier, data-quality flags, semantic match \
results if available). You must ground every claim in those facts — never invent new \
evidence, and never claim higher certainty than the confidence tier supports.

Respond with a JSON object with exactly these keys:
- "disposition": one of "Reuse", "Extend", "Rebuild", "Sunset - No Replacement Needed"
- "effort": one of "S", "M", "L"
- "rationale": 2-4 sentences a program manager could read to a business stakeholder, citing \
the specific facts you were given (confidence tier, quality flags, semantic score if present)
- "requires_human_review": boolean — true unless the evidence is overwhelmingly clear

Guidance:
- No candidates at all + Qlik app is actively used -> "Rebuild"
- No candidates at all + Qlik app is stale/low quality -> "Sunset - No Replacement Needed" \
(there's likely nothing worth rebuilding)
- High confidence candidate with strong semantic score -> "Reuse"
- Medium confidence, or High confidence with real gaps -> "Extend"
- Always set requires_human_review to true when confidence tier is Medium or Low, or when \
the semantic match was unavailable (llm_used: false)."""

    def _grounding_query(self, user_message: str) -> dict | None:
        return None

    def process(self, data: dict[str, Any]) -> dict[str, Any]:
        qlik_name = data["qlik_name"]
        qlik_quality_flags = data.get("qlik_quality_flags", [])
        candidate = data.get("best_candidate")  # dict or None

        if candidate:
            candidate_block = f"""Best candidate: {candidate['pbi_name']} (workspace: {candidate['pbi_workspace_name']})
Confidence tier: {candidate['confidence_tier']}
Lineage match: {candidate['lineage_match']} — {candidate['lineage_signal']}
Name similarity: {candidate['name_similarity']}, measure overlap: {candidate['measure_overlap']}
Signals missing: {', '.join(candidate.get('signals_missing', [])) or '(none)'}
Semantic match used LLM: {candidate.get('semantic_used_llm')}
Semantic score: {candidate.get('semantic_score')}
Matched concepts: {', '.join(candidate.get('matched_concepts', [])) or '(none)'}
Unmatched concepts: {', '.join(candidate.get('unmatched_concepts', [])) or '(none)'}"""
        else:
            candidate_block = "No candidates survived eligibility filtering + blocking for this Qlik app."

        user_message = f"""## Qlik App Being Sunset
Name: {qlik_name}
Data quality flags: {', '.join(qlik_quality_flags) or '(none)'}

## Candidate
{candidate_block}

Recommend a disposition."""

        try:
            result = self.call_llm_json(user_message)
            return {
                "llm_used": True,
                "disposition": result.get("disposition"),
                "effort": result.get("effort"),
                "rationale": result.get("rationale", ""),
                "requires_human_review": bool(result.get("requires_human_review", True)),
            }
        except Exception as exc:  # noqa: BLE001 - deliberate broad catch for graceful degradation
            # Deterministic fallback — never silently invents a confident recommendation.
            if candidate is None:
                disposition = (
                    "Sunset - No Replacement Needed"
                    if "stale" in " ".join(qlik_quality_flags)
                    else "Rebuild"
                )
            elif candidate["confidence_tier"] == "High":
                disposition = "Reuse"
            elif candidate["confidence_tier"] == "Medium":
                disposition = "Extend"
            else:
                disposition = "Rebuild"
            return {
                "llm_used": False,
                "disposition": disposition,
                "effort": "M",
                "rationale": (
                    "LLM advisor unavailable "
                    f"({type(exc).__name__}: {exc}). Disposition derived mechanically from "
                    "confidence tier only — treat this as a starting hypothesis, not a "
                    "grounded recommendation, and prioritize this case for human review."
                ),
                "requires_human_review": True,
            }

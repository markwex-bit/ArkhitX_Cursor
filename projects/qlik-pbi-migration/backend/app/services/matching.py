"""
Stage 1 — Candidate generation (blocking) + Stage 3 — confidence tiering.

Deterministic. At sample scale (3 Qlik apps x a handful of eligible Power BI
apps) this is a trivial in-memory comparison. At real scale (400 x 75,000,
post-filtering to low thousands) this exact interface — generate_candidates()
— is what gets swapped for a Neo4j traversal ("PBI datasets within 2 hops of
this Qlik app via a shared data connection"), with no change to callers. See
the "Knowledge graph — scoped honestly" section of the project plan.
"""
from __future__ import annotations

import difflib

from app.models.catalog import ConfidenceTier, MatchCandidate, PowerBIApp, QlikApp

# Below this composite score, a pair isn't even a weak candidate — it never
# reaches the LLM semantic-match stage.
BLOCKING_THRESHOLD = 0.12
TOP_N_CANDIDATES = 5


def _norm(s: str) -> str:
    return "".join(c for c in s.lower() if c.isalnum())


def _text_similarity(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def _word_overlap(a: list[str], b: list[str]) -> float:
    sa = {w.lower() for w in a if w}
    sb = {w.lower() for w in b if w}
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _lineage_matches(qlik_connections: list[str], pbi_connections: list[str]) -> list[tuple[str, str]]:
    """Substring-based match, not exact equality — Power BI often stores a
    full server/database/path string where Qlik only has a short connection
    name (e.g. Qlik 'OPS_FILESHARE' vs PBI path '\\\\fileserver\\ops\\OPS_FILESHARE')."""
    matches = []
    for qc in qlik_connections:
        if not qc:
            continue
        for pc in pbi_connections:
            if not pc:
                continue
            if qc.lower() in pc.lower() or pc.lower() in qc.lower():
                matches.append((qc, pc))
    return matches


def _confidence_tier(lineage_match: bool, name_sim: float, measure_overlap: float) -> ConfidenceTier:
    if lineage_match and (name_sim > 0.3 or measure_overlap > 0.15):
        return ConfidenceTier.HIGH
    if lineage_match or name_sim > 0.4 or measure_overlap > 0.25:
        return ConfidenceTier.MEDIUM
    return ConfidenceTier.LOW


def generate_candidates(
    qlik_apps: list[QlikApp],
    eligible_pbi_apps: list[PowerBIApp],
    top_n: int = TOP_N_CANDIDATES,
) -> dict[str, list[MatchCandidate]]:
    results: dict[str, list[MatchCandidate]] = {}

    for qapp in qlik_apps:
        scored: list[MatchCandidate] = []

        for papp in eligible_pbi_apps:
            lineage_matches = _lineage_matches(qapp.data_connections, papp.datasource_connections)
            lineage_match = bool(lineage_matches)

            name_sim = _text_similarity(qapp.name, papp.name)
            measure_overlap = _word_overlap(
                qapp.measures + qapp.dimensions, papp.measures + papp.tables
            )
            sheet_name_sim = max(
                (_text_similarity(s, papp.name) for s in qapp.sheets), default=0.0
            )

            composite = (
                (0.5 if lineage_match else 0.0)
                + name_sim * 0.25
                + measure_overlap * 0.15
                + sheet_name_sim * 0.10
            )
            if composite < BLOCKING_THRESHOLD:
                continue

            signals_available, signals_missing = [], []
            if lineage_match:
                signals_available.append("shared_data_connection")
            else:
                signals_missing.append("shared_data_connection")
            if papp.has_refresh_schedule:
                signals_available.append("refresh_metadata")
            else:
                signals_missing.append("refresh_metadata")
            if papp.description:
                signals_available.append("pbi_description")
            else:
                signals_missing.append("pbi_description")
            if qapp.description:
                signals_available.append("qlik_description")
            else:
                signals_missing.append("qlik_description")

            tier = _confidence_tier(lineage_match, name_sim, measure_overlap)

            lineage_signal = (
                f"Shared data connection: {', '.join(sorted({qc for qc, _ in lineage_matches}))}"
                if lineage_match
                else "No shared data-connection identified"
            )

            scored.append(
                MatchCandidate(
                    qlik_app_id=qapp.id,
                    pbi_dataset_id=papp.dataset_id,
                    pbi_name=papp.name,
                    pbi_workspace_name=papp.workspace_name,
                    lineage_match=lineage_match,
                    lineage_signal=lineage_signal,
                    name_similarity=round(name_sim, 2),
                    measure_overlap=round(measure_overlap, 2),
                    confidence_tier=tier,
                    signals_available=signals_available,
                    signals_missing=signals_missing,
                )
            )

        scored.sort(
            key=lambda c: (
                {"High": 0, "Medium": 1, "Low": 2}[c.confidence_tier.value],
                -(c.name_similarity + c.measure_overlap),
            )
        )
        results[qapp.id] = scored[:top_n]

    return results

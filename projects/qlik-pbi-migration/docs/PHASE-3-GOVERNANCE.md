# Phase 3 — Governance

**Status: not started.** This project is still Phase 0. The notes below are decisions already
made that must carry forward once Phase 3 wiring actually begins — do not lose them.

## Decisions to carry into this phase

- **Retrieval strategy is now a required, structurally-enforced choice** (added to the framework
  after this project's Phase 0 build). Before wiring `_grounding_query()` on `SemanticMatchAgent`
  and `MigrationAdvisorAgent`, classify each agent's "ask" and pick `graph` / `structured` /
  `vector` / `hybrid` per `framework/docs/ARCHITECTURE-PRINCIPLES.md` ("Layer 3: Grounding").
  `GovernedBaseAgent.call_llm()` raises `ValueError` if this is omitted — it cannot be skipped.
  Leading candidate for this project: **hybrid** — graph traversal on shared data-source lineage,
  reranked by embedding similarity on name/measure text — see the "Metadata comparison" discussion
  below for why pure graph traversal alone likely under-serves this project's actual ask.
- **Full-fidelity LLM I/O capture is needed for human validation**, independent of Phase 3.
  ArkhitX's `audit_logs` only stores a 500-character `response_preview` by default — insufficient
  for a reviewer to verify the semantic-match/migration-advisor LLM calls against the same
  evidence the model saw. Persist the literal prompt + full raw response for every
  `SemanticMatchAgent`/`MigrationAdvisorAgent` call (locally now; extend `audit_logs`'
  `context`/`result` payload to carry full, non-truncated I/O for these two agents specifically
  once wired).
- **A golden-query grounding eval is required at Phase 4**, not just a grounding-score threshold
  — see `framework/docs/04-VALIDATE-GROUNDING.md`. Build `docs/golden_queries.json` for this
  project before validating.
- **HITL confidence-threshold pattern** — this project's Stage 4 sign-off gate (`services/signoff.py`)
  is the reference implementation the framework's `ARCHITECTURE-PRINCIPLES.md` cross-cutting
  pattern was extracted from. When wiring this phase, log every sign-off decision to the
  `gate_decisions` table (see `GOVERNANCE-PRINCIPLES.md`), not just `audit_logs`.

## What Was Wired

<!-- Describe which agents implement _grounding_query() and what they query -->

## Enabling Governance

1. Start ArkhitX infrastructure: `cd infrastructure && docker-compose up -d`
2. Register project: `python projects/qlik-pbi-migration/scripts/01_register_project.py`
3. Seed graph: `python projects/qlik-pbi-migration/scripts/02_seed_graph.py`
4. Add `ARKHITX_*` values to `.env`
5. Restart project: `docker-compose up --build`

## Validating

Check the ArkhitX Dashboard at http://localhost:8090.
Every agent call should appear in the Audit Log with a grounding score.

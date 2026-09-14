# Phase 3: Wire Governance

## Purpose

Add ArkhitX governance **around the existing solution**: install `arkhitx-sdk`, connect with `ArkhitXClient`, and route agent LLM calls through `GovernedBaseAgent` so audits and grounding records write to PostgreSQL when ArkhitX is configured.

## Prerequisites

- Phases 1–2 complete: project registered, Neo4j populated for grounding queries.

## Steps

0. **Choose a retrieval strategy per agent — before wiring `_grounding_query()`.**
   For each agent, classify the kind of "ask" it answers (relationship/lineage,
   exact lookup, semantic similarity, or structural-then-semantic) and pick
   `graph`, `structured`, `vector`, or `hybrid` accordingly — see the decision
   table in `ARCHITECTURE-PRINCIPLES.md` ("Layer 3: Grounding"). This is not
   optional: `GovernedBaseAgent.call_llm()` raises `ValueError` if a grounding
   spec omits `retrieval_strategy`. Record the choice and rationale for each
   agent in the project's `docs/PHASE-3-GOVERNANCE.md` before moving to step 3.

1. **Install the SDK** — Add the local package (or published wheel) from `ArkhitX_Cursor/sdk/` to the solution environment; ensure `anthropic` and `neo4j` dependencies match the SDK.

2. **Detect ArkhitX at runtime** — In `base_agent.py` (or a single factory), if `ARKHITX_DATABASE_URL` and `ARKHITX_PROJECT_ID` are set, construct `ArkhitXClient(project_id=...)`; otherwise keep the pre-Phase-0 behavior (direct LLM, no audit).

```python
# sdk/arkhitx/client.py
from arkhitx.client import ArkhitXClient

def get_arkhitx() -> ArkhitXClient | None:
    if os.getenv("ARKHITX_DATABASE_URL") and os.getenv("ARKHITX_PROJECT_ID"):
        return ArkhitXClient()
    return None
```

3. **Subclass `GovernedBaseAgent`** — Replace plain base-agent LLM calls with `GovernedBaseAgent`: set `agent_id` to match `agent_prompts.id`, implement `_default_system_prompt()`, call `self.call_llm(...)` or `self.call_llm_json(...)`.

```python
# sdk/arkhitx/governed_agent.py
from arkhitx.governed_agent import GovernedBaseAgent

class MappingAgent(GovernedBaseAgent):
    agent_id = "payroll_mapping"

    def _default_system_prompt(self) -> str:
        return "You map payroll components to GL accounts. Use only provided context."

    def _grounding_query(self, user_message: str):
        return {
            "entity_type": "AccountMapping",
            "filters": None,
            "depth": 1,
            "retrieval_strategy": "graph",  # chosen in Step 0 above
        }
```

4. **Override `_grounding_query` selectively** — Return `None` to skip grounding context for that call. Otherwise return a dict including the `retrieval_strategy` chosen in Step 0 (`graph`, `structured`, `vector`, or `hybrid`) plus that strategy's required fields — see `ArkhitXClient.get_grounding_context` (`sdk/arkhitx/client.py`) for exactly what each strategy needs. Omitting `retrieval_strategy` raises `ValueError` at call time.

5. **Keep prompts in ArkhitX** — Seed and update rows in `agent_prompts` (registration script or UI). `GovernedBaseAgent` loads model parameters and system prompt from the DB when `agent_id` matches.

## SDK reference

| File | Responsibility |
|------|----------------|
| `sdk/arkhitx/client.py` | `ArkhitXClient`, `log_audit`, `store_grounding`, `get_grounding_context` |
| `sdk/arkhitx/governed_agent.py` | `GovernedBaseAgent`, `call_llm`, `_grounding_query` |

## Next phase

Proceed to [04-VALIDATE-GROUNDING.md](04-VALIDATE-GROUNDING.md) to validate grounding end-to-end.

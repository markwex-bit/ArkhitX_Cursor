# Phase 4: Validate Grounding

## Purpose

Run the solution **end-to-end** with ArkhitX enabled. Confirm PostgreSQL receives audit and grounding rows, and that **grounding scores** meet agreed thresholds.

## Prerequisites

- Phase 3 complete: agents use `GovernedBaseAgent` (or equivalent) when env vars are set.

## Steps

1. **Run representative flows** — Exercise each agent path that uses `call_llm` / `call_llm_json`: uploads, mapping, reconciliation, or domain-specific actions.

2. **Inspect `audit_logs`** — Query ArkhitX PostgreSQL for recent rows with `action = 'llm_call'` and `actor` like `agent:<agent_id>`. Confirm `context` includes `grounding_score`, `elapsed_ms`, and model settings.

```sql
SELECT id, actor, action, context, result, created_at
FROM audit_logs
WHERE project_id = '<your-project-uuid>'
ORDER BY created_at DESC
LIMIT 50;
```

3. **Inspect `grounding_records`** — Verify `agent_name`, `grounding_score`, `node_count`, `cited_nodes`, and `query_path` populate for grounded calls.

```sql
SELECT agent_name, grounding_score, node_count, response_summary, created_at
FROM grounding_records
WHERE project_id = '<your-project-uuid>'
ORDER BY created_at DESC;
```

4. **Set thresholds** — Define minimum acceptable scores per agent (e.g. ≥ 0.7 average, no critical path below 0.5). Adjust `_grounding_query`, Neo4j data, or prompts until scores stabilize.

5. **Run a golden-query eval, not just a grounding score** — A high grounding score only proves the response cited *some* graph nodes; it doesn't prove retrieval found the *right* ones. For each agent, maintain a small golden set in `projects/{slug}/docs/golden_queries.json`: known asks paired with the node id(s) retrieval is expected to surface.

   ```json
   [
     { "agent_id": "mapping_agent", "ask": "Map GL account 4010", "expected_node_ids": ["acct-4010"] }
   ]
   ```

   Run each ask through the agent's real `_grounding_query()` + `ArkhitXClient.get_grounding_context()` path and assert `expected_node_ids` is a subset of the returned node ids. Failures here mean the chosen `retrieval_strategy` (graph/structured/vector/hybrid) or its parameters are wrong for that ask — revisit the Step 0 choice in `04-AGENT-BUILD.md` before tuning prompts.

6. **Document failures** — If scores are low, check empty graph matches, wrong `entity_type`/`retrieval_strategy` in `_grounding_query`, or responses that omit node identifiers (default scoring uses names/ids in text — see `_compute_grounding_score` in `sdk/arkhitx/governed_agent.py`).

## SDK reference

- `ArkhitXClient.log_audit` / `store_grounding` — `sdk/arkhitx/client.py`
- Grounding pipeline — `GovernedBaseAgent.call_llm` in `sdk/arkhitx/governed_agent.py`

## Next phase

Proceed to `06-DELIVERY-PACKAGE.md` for production handoff.

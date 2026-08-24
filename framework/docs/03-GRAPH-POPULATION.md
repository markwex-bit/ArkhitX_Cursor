# Phase 2 (advanced): Graph population patterns

## Primary doc

Core Phase 2 steps live in **`02-DATA-MAPPING.md`** (populate Neo4j, use `GraphPopulator` and `ArkhitXClient`). Use this file for non-trivial import strategy.

## Idempotent loads

- Prefer `MERGE` with a stable business key (not a random UUID per run) so re-imports update in place.
- Align merge keys with properties marked `"unique": true` in the ontology so constraints and application logic stay consistent.

## Multi-project or shared Neo4j

Pick one approach and apply it in every Cypher query:

- **Property filter** — Add `_project_id` (or `project_id`) on nodes/edges; include it in MATCH/WHERE during grounding and imports.
- **Label prefix** — Namespace labels (e.g. `ProjA_Client`) if multiple solutions share one DB and isolation must be absolute.

## Batch writes

- Chunk large files; wrap batches in a single session/transaction pattern appropriate to your Neo4j driver usage.
- Use `ArkhitXClient.write_graph` with parameters—never string-concatenate user or file data into Cypher.

## Post-import checks

```cypher
MATCH (n:YourLabel) RETURN labels(n), count(*) ORDER BY count(*) DESC;
MATCH ()-[r:YOUR_REL_TYPE]->() RETURN count(r);
```

Fix empty labels or zero edge counts before Phase 3 wiring.

## Next phase

Return to the main flow: `04-AGENT-BUILD.md` (wire governance).

# Phase 2 (advanced): Graph population patterns

## Primary doc

Core Phase 2 steps live in **[02-POPULATE-GRAPH.md](02-POPULATE-GRAPH.md)** (populate Neo4j, use `GraphPopulator` and `ArkhitXClient`). Use this file for non-trivial import strategy.

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

## Staleness policy (graph and vector retrieval)

Grounded answers degrade silently if the Neo4j graph — or a vector index built
on it — goes stale relative to the source system. Define this explicitly per
project rather than assuming re-import cadence is obvious:

- Stamp every node/relationship with `_last_synced_at` on import (already
  required by `ARCHITECTURE-PRINCIPLES.md`'s `_imported_at` convention).
- Pick a staleness threshold per entity type (e.g. 24h for fast-changing data,
  30 days for reference data) and record it in the project's ontology doc.
- If using `retrieval_strategy: vector` or `hybrid`, the vector index is a
  second staleness surface — re-embed and rebuild the index on the same cadence
  as the underlying node re-import, not on a separate schedule.
- Surface staleness in the grounding response where practical (e.g. include
  `_last_synced_at` in cited node properties) so a stale-but-plausible answer
  is distinguishable from a fresh one during Phase 4 validation.

## Post-import checks

```cypher
MATCH (n:YourLabel) RETURN labels(n), count(*) ORDER BY count(*) DESC;
MATCH ()-[r:YOUR_REL_TYPE]->() RETURN count(r);
```

Fix empty labels or zero edge counts before Phase 3 wiring.

## Next phase

Return to the main flow: [03-WIRE-GOVERNANCE.md](03-WIRE-GOVERNANCE.md).

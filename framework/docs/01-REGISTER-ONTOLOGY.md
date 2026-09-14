# Phase 1: Register Project and Extract Ontology

## Purpose

Capture the **domain model from working code**, register the project in ArkhitX PostgreSQL, and persist an ontology schema JSON that Neo4j and agents will use later.

## Prerequisites

- Phase 0 complete: POC/MVP runs without ArkhitX.

## Steps

1. **Inventory the codebase** — List entities, relationships, and key fields from models, DTOs, DB schemas, and agent inputs/outputs. Treat the running app as the specification.

2. **Author ontology JSON** — Use the SDK-friendly shape: top-level `entity_types` and `relationship_types`, each property may set `"unique": true` for constraint generation. Mirror `sdk/ontologies/payroll_reconciliation.json`.

```json
{
  "project_name": "Your Solution",
  "version": "1.0.0",
  "extracted_from": "/path/to/your/repo",
  "entity_types": {
    "Client": {
      "description": "...",
      "properties": {
        "name": { "type": "string", "required": true, "unique": true }
      }
    }
  },
  "relationship_types": {}
}
```

3. **Register in ArkhitX** — Insert/update the `projects` row, attach `ontology_schema` (or equivalent column your deployment uses), seed `agent_prompts`, and log to `audit_logs`. Copy the pattern in `sdk/scripts/register_payroll_project.py`: it uses `ArkhitXClient` and `GraphPopulator`.

```python
# Pattern from sdk/scripts/register_payroll_project.py
from arkhitx.client import ArkhitXClient
from arkhitx.graph_populator import GraphPopulator

client = ArkhitXClient(project_id=os.environ["ARKHITX_PROJECT_ID"])
# register project row, upsert prompts, store ontology on project — see script
populator = GraphPopulator(client)
populator.load_ontology("path/to/your_ontology.json")
populator.create_constraints()  # Neo4j constraints from unique properties
```

4. **Wire environment** — Set `ARKHITX_DATABASE_URL`, `ARKHITX_NEO4J_URI`, `ARKHITX_NEO4J_USER`, `ARKHITX_NEO4J_PASSWORD`, and `ARKHITX_PROJECT_ID` for scripts and later phases.

## SDK reference

| Piece | Location |
|--------|----------|
| DB + Neo4j client | `sdk/arkhitx/client.py` — `ArkhitXClient` |
| Constraints / merge helpers | `sdk/arkhitx/graph_populator.py` — `GraphPopulator` |
| Full registration example | `sdk/scripts/register_payroll_project.py` |

## Outputs

- Ontology file versioned with the solution (or exported next to it).
- Project row and prompts in ArkhitX PostgreSQL.
- Neo4j constraints created for unique fields (via `GraphPopulator.create_constraints()`).

## Next phase

Proceed to [02-POPULATE-GRAPH.md](02-POPULATE-GRAPH.md) to populate the graph with domain data.

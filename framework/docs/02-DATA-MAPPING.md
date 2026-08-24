# Phase 2: Populate Graph

## Purpose

Import **domain data** into Neo4j as nodes and relationships so agents can retrieve grounding context. Use the SDK’s `GraphPopulator` for constraints (Phase 1) and for repeatable merge patterns.

## Prerequisites

- Phase 1 complete: project registered, ontology JSON loaded, constraints created.

## Steps

1. **Confirm constraints** — Run `GraphPopulator.load_ontology(...)` and `create_constraints()` if not already done after ontology edits.

```python
from arkhitx.client import ArkhitXClient
from arkhitx.graph_populator import GraphPopulator

client = ArkhitXClient(project_id="your-uuid")
populator = GraphPopulator(client)
populator.load_ontology("ontologies/your_project.json")
populator.create_constraints()
```

2. **Seed reference data** — Use SDK helpers where they fit (e.g. `seed_systems`, `seed_account_mappings` in `sdk/arkhitx/graph_populator.py`) or implement domain-specific loaders that call `merge_node` / `merge_relationship`.

```python
populator.merge_node(
    "AccountMapping", id_field="id", id_value="client_401k",
    properties={"id": "client_401k", "payroll_component": "401k", "account_number": "2200"},
)
populator.merge_relationship(
    "Client", "name", "Acme LLC",
    "AccountMapping", "id", "client_401k",
    "HAS_MAPPING",
    properties={"confidence": 1.0},
)
```

3. **Bulk import** — For CSV/exports, read rows in Python and call `merge_node` / `merge_relationship`, or use `ArkhitXClient.write_graph()` with parameterized Cypher for high-volume batches.

```python
client.write_graph(
    """
    MERGE (p:PayrollPeriod {id: $id})
    SET p.gross_pay = $gross_pay, p.pay_date = $pay_date
    """,
    {"id": row["period_id"], "gross_pay": float(row["gross"]), "pay_date": row["pay_date"]},
)
```

4. **Validate** — Run MATCH/count queries via `client.query_graph()` to ensure each critical label has rows and relationship types used in grounding queries exist.

## SDK reference

| API | Role |
|-----|------|
| `GraphPopulator` | `sdk/arkhitx/graph_populator.py` — constraints, `merge_node`, `merge_relationship`, seeds |
| `ArkhitXClient.write_graph` / `query_graph` | `sdk/arkhitx/client.py` — arbitrary Cypher |

## Advanced patterns

See `03-GRAPH-POPULATION.md` for idempotency, multi-tenant properties, and validation queries.

## Next phase

Proceed to `04-AGENT-BUILD.md` to install the SDK and wire governance into agents.

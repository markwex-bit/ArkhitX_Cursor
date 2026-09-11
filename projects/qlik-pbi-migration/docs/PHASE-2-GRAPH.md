# Phase 2 — Knowledge Graph

## What Was Seeded

<!-- Describe what nodes and relationships were created in Neo4j -->

## Seed Command

```bash
python projects/qlik-pbi-migration/scripts/02_seed_graph.py
```

## Verify in Neo4j Browser

Open http://localhost:7474 and run:
```cypher
MATCH (n) RETURN n LIMIT 50
```

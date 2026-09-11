# Phase 0: Build Solution

## Purpose

Deliver a working POC or MVP **without** ArkhitX. The code is the source of truth for the domain model. Governance attaches in later phases.

## Scope

- Use Cursor (or your usual stack) to implement the solution end-to-end: APIs, agents, UI, file handling—whatever the client needs.
- Do **not** install `arkhitx-sdk`, connect to ArkhitX PostgreSQL, or require Neo4j for the POC to run.
- Iterate until flows work on real sample data: parse, map, reconcile, or whatever the product does.

## Exit criteria

- Core user journeys run successfully in dev (or demo) environment.
- Domain concepts exist in code: models, types, agent prompts in-repo, or equivalent—something Phase 1 can reverse-engineer into an ontology.
- **Architecture docs exist:** `docs/ARCHITECTURE.md` + `docs/architecture-overview.html` (HTML-rendered Mermaid, no PNG).

## Handoff line

**Build until it works, then return for Phase 1** (`01-ONTOLOGY-DESIGN.md`). Do not block the POC on registration, graph design, or governance.

## Next phase

After the solution is demonstrably working, proceed to `01-ONTOLOGY-DESIGN.md` to register the project in ArkhitX and extract the ontology from this codebase.

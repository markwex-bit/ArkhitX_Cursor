# ArkhitX Framework Documentation

**Start with [METHODOLOGY.md](../../METHODOLOGY.md)** at the workspace root — it is
the canonical guide. This folder contains phase instruction docs and reference material.

---

## Phase Instruction Docs (use these)

| Phase | Name | File |
|-------|------|------|
| A | Architecture & Design | [0A-ARCHITECTURE-AND-DESIGN.md](0A-ARCHITECTURE-AND-DESIGN.md) |
| 0 | Build | [00-BUILD-SOLUTION.md](00-BUILD-SOLUTION.md) |
| 1 | Register + extract ontology | [01-REGISTER-ONTOLOGY.md](01-REGISTER-ONTOLOGY.md) |
| 2 | Populate graph | [02-POPULATE-GRAPH.md](02-POPULATE-GRAPH.md) |
| 2 | Advanced graph patterns | [02-POPULATE-GRAPH-ADVANCED.md](02-POPULATE-GRAPH-ADVANCED.md) |
| 3 | Wire governance | [03-WIRE-GOVERNANCE.md](03-WIRE-GOVERNANCE.md) |
| 4 | Validate grounding | [04-VALIDATE-GROUNDING.md](04-VALIDATE-GROUNDING.md) |
| 5 | Ship | [05-SHIP.md](05-SHIP.md) |

Filename prefix matches phase number (`0A` for Architecture, `00`–`05` for Phases 0–5).

**Dashboard tracking:** Phase A and Phases 0–3 are tracked on the Projects tab.
Phases 4–5 are manual consultant sign-off (validation and delivery).

---

## Reference Docs (use these)

| Doc | Purpose |
|-----|---------|
| [ARCHITECTURE-PRINCIPLES.md](ARCHITECTURE-PRINCIPLES.md) | Four layers, data placement rules |
| [GOVERNANCE-PRINCIPLES.md](GOVERNANCE-PRINCIPLES.md) | PostgreSQL schema, governance rules |
| [ARCHITECTURE-DECISIONS.md](ARCHITECTURE-DECISIONS.md) | Why `framework/` vs `projects/` |
| [PROD_ARCHITECTURE.md](PROD_ARCHITECTURE.md) | Production deployment patterns |

---

## Archived Docs (do not use)

Superseded documents live in [archive/](archive/). They describe a **design-first**
model where solution agents were built in Phase 4 — contradicting the current
**build-first, govern-after** model (build in Phase 0).

See [archive/README.md](archive/README.md) for details.

---

## Related Workspace Docs

| Doc | Purpose |
|-----|---------|
| [METHODOLOGY.md](../../METHODOLOGY.md) | Canonical methodology — start here |
| [WORKSPACE.md](../../WORKSPACE.md) | Quick start, ports, env vars |
| [README.md](../../README.md) | Product overview, SDK, dashboard |
| [.cursorrules](../../.cursorrules) | AI session rules for Cursor |

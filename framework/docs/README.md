# ArkhitX Framework Documentation

**Start with [METHODOLOGY.md](../../METHODOLOGY.md)** at the workspace root — it is
the canonical guide. This folder contains phase instruction docs and reference material.

---

## Phase Instruction Docs (use these)

| Phase | Name | File |
|-------|------|------|
| 0 | Build | [00-PROJECT-KICKOFF.md](00-PROJECT-KICKOFF.md) |
| 1 | Register + extract ontology | [01-ONTOLOGY-DESIGN.md](01-ONTOLOGY-DESIGN.md) |
| 2 | Populate graph | [02-DATA-MAPPING.md](02-DATA-MAPPING.md) |
| 2 | Advanced graph patterns | [03-GRAPH-POPULATION.md](03-GRAPH-POPULATION.md) |
| 3 | Wire governance | [04-AGENT-BUILD.md](04-AGENT-BUILD.md) |
| 4 | Validate grounding | [05-SOLUTION-VALIDATION.md](05-SOLUTION-VALIDATION.md) |
| 5 | Ship | [06-DELIVERY-PACKAGE.md](06-DELIVERY-PACKAGE.md) |

**Note:** Filenames use legacy numbering (`04-AGENT-BUILD.md` = Phase 3). The phase
number in each file's title is authoritative.

**Dashboard tracking:** Phases 0–3 are auto-detected. Phases 4–5 are manual
consultant sign-off (validation and delivery).

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

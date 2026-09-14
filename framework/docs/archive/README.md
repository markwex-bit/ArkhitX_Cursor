# Archived Documentation

These documents describe a **superseded design-first methodology** and should
**not** be used for new work.

---

## Why these were archived

The current ArkhitX model is **build first, govern after**:

1. **Phase 0** — Build the AI solution standalone (no ArkhitX)
2. **Phases 1–3** — Register, seed graph, wire `GovernedBaseAgent`
3. **Phases 4–5** — Validate grounding and ship

The archived docs below assume a **design-first pipeline** where:

- Solution agents were built in **Phase 4** (not Phase 0)
- Phase 0 was "signal extraction" / kickoff, not building the app
- HITL gates followed a 7-phase consultant workflow (`signal_gate`, `schema_gate`, etc.)
- The workspace had `backend/` at repo root instead of `framework/backend/`

That model contradicts how ArkhitX works today.

---

## Archived files

| File | Superseded by |
|------|---------------|
| `STARTER-TEMPLATE-GUIDE.md` | [ARCHITECTURE-DECISIONS.md](../ARCHITECTURE-DECISIONS.md), [METHODOLOGY.md](../../METHODOLOGY.md) |
| `AGENT-DESIGN-PATTERNS.md` | [03-WIRE-GOVERNANCE.md](../03-WIRE-GOVERNANCE.md), SDK `GovernedBaseAgent` |
| `HITL-GATE-PATTERNS.md` | Phase Gate Validator agent, dashboard auto-detection (Phases 0–3) |

---

## What to use instead

| Start here | Purpose |
|------------|---------|
| [METHODOLOGY.md](../../METHODOLOGY.md) | Canonical methodology |
| [framework/docs/README.md](../README.md) | Index of active docs |
| [0A-ARCHITECTURE-AND-DESIGN.md](../0A-ARCHITECTURE-AND-DESIGN.md) through [05-SHIP.md](../05-SHIP.md) | Phase instructions |

---

## Known legacy code (not yet updated)

The backend API in `framework/backend/app/api/projects.py` still uses old phase
names (`kickoff`, `ontology_design`, `agent_build`, etc.) and a 0–6 phase range.
The dashboard Applications API uses the correct 0–3 auto-detection model. Code
cleanup is tracked separately from this documentation alignment.

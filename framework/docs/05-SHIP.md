# Phase 5: Ship

## Purpose

Deliver a **production-ready** solution: full governance when ArkhitX is configured, and **unchanged core behavior** when env vars are unset (POC mode).

## Prerequisites

- Phase 4 complete: grounding validated; thresholds documented.

## Steps

1. **Verify dual mode** — With `ARKHITX_*` unset, run smoke tests: solution behaves as in Phase 0. With vars set, confirm audits and grounding records appear.

2. **Package governance artifacts** — Export or document:
   - Ontology JSON and Neo4j constraint/migration notes
   - Agent ids and prompt versions (`agent_prompts`)
   - Sample SQL or dashboard queries for `audit_logs` and `grounding_records`
   - Environment variable checklist (`ARKHITX_DATABASE_URL`, `ARKHITX_PROJECT_ID`, `ARKHITX_NEO4J_*`, `ANTHROPIC_API_KEY`)

3. **Harden operations** — Document how to rotate keys, re-import graph data (Phase 2 patterns in [02-POPULATE-GRAPH.md](02-POPULATE-GRAPH.md)), and triage low grounding scores.

4. **Final checklist**

- [ ] Production deploy runs with health checks for app + Neo4j + Postgres (if used).
- [ ] No secrets committed; `.env.example` lists ArkhitX-related vars as optional.
- [ ] Runbook states: governed mode vs standalone mode.
- [ ] Client sign-off on grounding thresholds from Phase 4.

## SDK reference

- Integration surface: `sdk/arkhitx/client.py`, `sdk/arkhitx/governed_agent.py`, `sdk/arkhitx/graph_populator.py`
- Registration template: `sdk/scripts/register_payroll_project.py`

## Retrofit summary

| Phase | Doc |
|-------|-----|
| A Architecture & Design | `0A-ARCHITECTURE-AND-DESIGN.md` |
| 0 Build | `00-BUILD-SOLUTION.md` |
| 1 Register + ontology | `01-REGISTER-ONTOLOGY.md` |
| 2 Populate graph | `02-POPULATE-GRAPH.md` (+ `02-POPULATE-GRAPH-ADVANCED.md`) |
| 3 Wire governance | `03-WIRE-GOVERNANCE.md` |
| 4 Validate grounding | `04-VALIDATE-GROUNDING.md` |
| 5 Ship | `05-SHIP.md` |

## Project complete

Log delivery in your process (`audit_logs` / `pipeline_events` if used). Hand off repo, infra, and governance exports to the client.

# ArkhitX Methodology

**Start here.** This is the single canonical guide for how ArkhitX works.

> **Build first. Govern after.**
>
> You build the AI solution first — without ArkhitX. Once it works, you retrofit
> ArkhitX to add audit trails, grounding scores, knowledge graph context, and
> managed prompts. ArkhitX is a governance layer, not a solution builder.

---

## What ArkhitX Is

ArkhitX is **governance and grounding infrastructure** for AI-powered solutions.

| Component | Technology | Purpose |
|-----------|------------|---------|
| Governance DB | PostgreSQL | Audit logs, grounding records, agent prompts |
| Knowledge Graph | Neo4j | Domain entities, relationships, ontology constraints |
| SDK | Python (`arkhitx-sdk`) | Wraps LLM calls with audit + grounding |
| Dashboard | React + FastAPI | Project status, audit trail, prompt editing |

**ArkhitX governs. The project solves.**

Your application lives in `projects/{slug}/`. ArkhitX lives in `framework/` and
`infrastructure/`. The solution runs perfectly without ArkhitX — governance is
additive, never a blocker.

ArkhitX **governs itself** — its seven rules are stored as `GovernanceRule` nodes
in Neo4j, and its own LLM calls are logged to its own audit trail.

---

## Build Order (Critical)

```
1. Build your AI application (Phase 0)     ← standalone, no ArkhitX required
2. Apply ArkhitX governance (Phases 1–3)   ← register, seed graph, wire SDK
3. Validate and ship (Phases 4–5)          ← consultant QA and handoff
```

`python scripts/new_project.py <slug>` scaffolds a **project folder** (backend,
frontend, docker-compose). That is a convenience layout — not ArkhitX governance.
Phase 0 still means: no `arkhitx-sdk` required, no ArkhitX PostgreSQL or Neo4j
connection for the POC to run.

Solution UIs use the shared ArkhitX design system (dark/light theme, `ax-*` tokens) —
see `framework/docs/DESIGN-SYSTEM.md`. New projects get this from `scripts/new_project.py`.

---

## The Four Layers

Every governed solution connects to four layers:

1. **Ontology** — Defines what CAN exist. Entity types, relationships, property
   schemas. **Extracted from working code** in Phase 1, not designed speculatively.

2. **Knowledge Graph (Neo4j)** — Holds what DOES exist. Domain data as nodes and
   edges. Agents query this for grounded context.

3. **Governance (PostgreSQL)** — Audit trails, managed prompts, grounding scores,
   pipeline state. Every LLM call is logged here.

4. **SDK (`arkhitx-sdk`)** — The bridge. `GovernedBaseAgent` wraps LLM calls with
   pre-call grounding queries and post-call audit logging.

See [framework/docs/ARCHITECTURE-PRINCIPLES.md](framework/docs/ARCHITECTURE-PRINCIPLES.md)
for layer rules and [framework/docs/GOVERNANCE-PRINCIPLES.md](framework/docs/GOVERNANCE-PRINCIPLES.md)
for the database schema.

---

## The Phases

| Phase | Name | What Happens | Dashboard auto-tracks? |
|-------|------|--------------|------------------------|
| **A** | Architecture & Design | Approve architecture docs and ADRs before any code. | Yes (Projects tab) |
| **0** | Build | Build POC/MVP with Cursor. No ArkhitX. | Files on disk |
| **1** | Register | Extract ontology from code. Register in ArkhitX. | Yes |
| **2** | Populate Graph | Seed Neo4j from `governance/seed_data.json`. | Yes |
| **3** | Wire Governance | Install SDK. Agents extend `GovernedBaseAgent`. | Yes |
| **4** | Validate Grounding | End-to-end QA. Confirm audit + grounding scores. | Manual |
| **5** | Ship | Verify dual mode. Package handoff artifacts. | Manual |

**Phase A and Phases 0–3** are tracked on the Projects tab. The Applications tab
auto-detects integration progress through Phase 3 based on registration, graph
seeding, and grounding records.

**Phases 4–5** are delivery milestones — consultant sign-off and client handoff.
They do not add new wiring; they verify what Phases 1–3 produced.

### Phase detail (deep dives)

| Phase | Instruction doc |
|-------|-----------------|
| A — Architecture & Design | [framework/docs/0A-ARCHITECTURE-AND-DESIGN.md](framework/docs/0A-ARCHITECTURE-AND-DESIGN.md) |
| 0 — Build | [framework/docs/00-BUILD-SOLUTION.md](framework/docs/00-BUILD-SOLUTION.md) |
| 1 — Register | [framework/docs/01-REGISTER-ONTOLOGY.md](framework/docs/01-REGISTER-ONTOLOGY.md) |
| 2 — Populate Graph | [framework/docs/02-POPULATE-GRAPH.md](framework/docs/02-POPULATE-GRAPH.md) |
| 2 — Advanced patterns | [framework/docs/02-POPULATE-GRAPH-ADVANCED.md](framework/docs/02-POPULATE-GRAPH-ADVANCED.md) |
| 3 — Wire Governance | [framework/docs/03-WIRE-GOVERNANCE.md](framework/docs/03-WIRE-GOVERNANCE.md) |
| 4 — Validate | [framework/docs/04-VALIDATE-GROUNDING.md](framework/docs/04-VALIDATE-GROUNDING.md) |
| 5 — Ship | [framework/docs/05-SHIP.md](framework/docs/05-SHIP.md) |

Each project also keeps phase notes in `projects/{slug}/docs/PHASE-*.md`.

---

## The Seven Governance Rules

| ID | Rule | What It Enforces |
|----|------|------------------|
| RULE-001 | Audited | Every LLM call logged to `audit_logs` |
| RULE-002 | Grounded | Agents override `_grounding_query()` for KG context |
| RULE-003 | DB Prompts | Prompts in `agent_prompts`, loaded at runtime |
| RULE-004 | Independent | Solution runs without ArkhitX when env vars unset |
| RULE-005 | Correct DBs | Domain data in Neo4j; governance in PostgreSQL |
| RULE-006 | No Workarounds | Structural fixes, not band-aid patches |
| RULE-007 | No Mocks | LLM failure raises error; empty DB returns empty results |

Stored as `GovernanceRule` nodes in Neo4j. Enforced by the Compliance Detector
and Compliance Checker agents in the dashboard.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Your Solution (projects/{slug}/)                           │
│  Built in Phase 0. Governed in Phase 3.                    │
│                                                             │
│  Agents extend GovernedBaseAgent from arkhitx-sdk           │
│  ↓ audit logs     ↓ grounding queries     ↓ prompt loads   │
├──────────────────────┬──────────────────────────────────────┤
│  PostgreSQL          │  Neo4j Knowledge Graph               │
│  (governance)        │  (grounding)                         │
│  - audit_logs        │  - domain entities                   │
│  - grounding_records │  - relationships                     │
│  - agent_prompts     │  - ontology constraints              │
├──────────────────────┴──────────────────────────────────────┤
│  ArkhitX Dashboard (http://localhost:8090)                  │
│  Audit trails · Grounding scores · Prompts · Phase status   │
└─────────────────────────────────────────────────────────────┘
```

---

## Retrofitting a Working Solution

After Phase 0 (solution works standalone):

1. **Start ArkhitX infrastructure:**
   ```bash
   cd infrastructure && docker-compose up -d
   ```

2. **Prepare governance files** in `projects/{slug}/`:
   - `ontology/{slug}.json` — domain schema extracted from code
   - `governance/prompts.json` — agent prompt definitions
   - `governance/seed_data.json` — domain reference data for Neo4j

3. **Phase 1 — Register:**
   ```bash
   python projects/{slug}/scripts/01_register_project.py
   ```
   Copy the printed `ARKHITX_PROJECT_ID` into the project `.env`.

4. **Phase 2 — Seed graph:**
   ```bash
   python projects/{slug}/scripts/02_seed_graph.py
   ```

5. **Phase 3 — Wire SDK:**
   ```bash
   pip install -e framework/sdk
   ```
   Make agents extend `GovernedBaseAgent`. Override `_grounding_query()` where
   KG context helps. See [framework/docs/03-WIRE-GOVERNANCE.md](framework/docs/03-WIRE-GOVERNANCE.md).

6. **Environment variables** (Phase 3+):
   ```bash
   ARKHITX_DATABASE_URL=postgresql://user:password@localhost:5432/arkhitx
   ARKHITX_NEO4J_URI=bolt://localhost:7687
   ARKHITX_NEO4J_USER=neo4j
   ARKHITX_NEO4J_PASSWORD=password
   ARKHITX_PROJECT_ID=<uuid from registration>
   ANTHROPIC_API_KEY=sk-ant-...
   ```

7. **Phases 4–5** — Follow validation and delivery checklists in
   [04-VALIDATE-GROUNDING.md](framework/docs/04-VALIDATE-GROUNDING.md) and
   [05-SHIP.md](framework/docs/05-SHIP.md).

---

## Workspace Layout

```
ArkhitX_Cursor/
├── METHODOLOGY.md         ← You are here (canonical methodology)
├── WORKSPACE.md           ← Workspace quick start
├── README.md              ← Product overview + quick start
├── framework/             ← ArkhitX infrastructure (never modified per project)
│   ├── backend/           ← Governance API (:8080)
│   ├── frontend/          ← Dashboard (:8090)
│   ├── sdk/               ← arkhitx-sdk Python package
│   └── docs/              ← Phase instruction docs (see docs/README.md)
├── infrastructure/        ← Shared Docker services (PostgreSQL, Neo4j)
├── scripts/new_project.py ← Scaffold a new project folder
└── projects/              ← Your AI applications (one folder per solution)
```

See [framework/docs/ARCHITECTURE-DECISIONS.md](framework/docs/ARCHITECTURE-DECISIONS.md)
for why the workspace is structured this way.

---

## Document Map

| Read this | When |
|-----------|------|
| **METHODOLOGY.md** (this file) | Always — start here |
| [WORKSPACE.md](WORKSPACE.md) | Running projects, ports, env vars |
| [README.md](README.md) | Product overview, SDK examples, dashboard |
| [framework/docs/README.md](framework/docs/README.md) | Index of all phase + reference docs |
| [.cursorrules](.cursorrules) | AI session rules for Cursor |

**Do not use** documents in [framework/docs/archive/](framework/docs/archive/) —
they describe a superseded design-first model.

---

## What the Client Gets

- **The solution** — runs independently with or without ArkhitX configured
- **Full governance** — every agent call logged, every response grounding-scored
- **Tunable AI** — agent prompts editable through the dashboard
- **Auditable history** — compliance teams trace any AI decision to source data

---

## Prerequisites

- **Cursor** — AI IDE for building the solution (Phase 0)
- **Docker Desktop** — PostgreSQL, Neo4j, ArkhitX dashboard
- **Anthropic API key** — Claude LLM access
- **A working solution** — or a project ready to build in Phase 0

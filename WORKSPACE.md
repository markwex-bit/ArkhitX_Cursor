# ArkhitX Workspace

This workspace contains the **ArkhitX governance framework** and all AI projects built with it.

---

## Workspace Structure

```
ArkhitX_Cursor/
├── WORKSPACE.md             ← You are here — start here
├── projects.json            ← Registry of all projects + auto-assigned ports
│
├── framework/               ← ArkhitX framework (internal — do not modify per project)
│   ├── backend/             ← ArkhitX governance API  (FastAPI)
│   ├── frontend/            ← ArkhitX governance dashboard (React)
│   ├── sdk/                 ← arkhitx-sdk Python package
│   └── docs/                ← ArkhitX methodology documentation
│
├── infrastructure/          ← Shared Docker services
│   └── docker-compose.yml   ← PostgreSQL · Neo4j · ArkhitX API · ArkhitX UI
│
├── scripts/
│   └── new_project.py       ← Scaffold a new project in 30 seconds
│
└── projects/                ← One folder per AI application
    ├── contract-review/     ← :3000 / api :8000
    ├── incident-classifier/ ← :3001 / api :8001
    ├── hr-policy-qa/        ← :3002 / api :8002
    └── supplier-risk/       ← :3003 / api :8003
```

**The separation is intentional:**
- `framework/` — ArkhitX infrastructure. Never touched when building a new project.
- `projects/` — Where all application work happens. Each project is fully self-contained.

---

## Quick Start

### Run a single project (standalone, Phase 0 — no governance needed)

```bash
cd projects/contract-review
docker-compose up --build
```

Open http://localhost:3000

### Start ArkhitX shared infrastructure (required for Phase 3 governance)

```bash
cd infrastructure
docker-compose up -d
```

Services started:

| Service           | URL                        | Purpose                      |
|-------------------|----------------------------|------------------------------|
| PostgreSQL        | localhost:5432             | Governance DB                |
| Neo4j Browser     | http://localhost:7474      | Knowledge graph explorer     |
| ArkhitX API       | http://localhost:8080      | Governance REST API          |
| ArkhitX Dashboard | http://localhost:8090      | Audit logs & grounding UI    |

---

## Creating a New Project

```bash
python scripts/new_project.py my-new-app --name "My New App"
```

Creates `projects/my-new-app/` with a complete, runnable skeleton:
backend · frontend · docker-compose · ArkhitX hooks · phase docs · ports auto-assigned.

---

## Projects at a Glance

| Project             | What It Does                                   | Frontend | API   |
|---------------------|------------------------------------------------|----------|-------|
| contract-review     | Extract clauses, score risk, answer questions  | :3000    | :8000 |
| incident-classifier | Classify IT incidents, suggest resolutions     | :3001    | :8001 |
| hr-policy-qa        | Answer HR policy questions from uploaded docs  | :3002    | :8002 |
| supplier-risk       | Score supplier risk across 4 dimensions        | :3003    | :8003 |

---

## The Four Phases

Every project follows the same lifecycle:

| Phase | Name           | What Happens                                                |
|-------|----------------|-------------------------------------------------------------|
| 0     | Build          | Build standalone AI app — just Claude + FastAPI, no ArkhitX |
| 1     | Register       | Extract ontology, register project in ArkhitX              |
| 2     | Populate Graph | Seed Neo4j with domain knowledge for grounding             |
| 3     | Wire Governance| Install SDK, wrap agents, enable audit logging             |

Each project's `docs/` folder contains a markdown file per phase.

---

## ArkhitX Methodology

See `framework/docs/` for the full methodology:

- `00-PROJECT-KICKOFF.md` — How to start a governed project
- `01-ONTOLOGY-DESIGN.md` — Extracting the ontology
- `02-DATA-MAPPING.md` — Mapping domain data
- `03-GRAPH-POPULATION.md` — Seeding the knowledge graph
- `04-AGENT-BUILD.md` — Wiring agents to GovernedBaseAgent

---

## Environment Variables

Every project needs at minimum:

```bash
ANTHROPIC_API_KEY=sk-ant-...       # Required for all phases
```

For Phase 3 governance, add after running `scripts/01_register_project.py`:

```bash
ARKHITX_DATABASE_URL=postgresql://user:password@localhost:5432/arkhitx
ARKHITX_NEO4J_URI=bolt://localhost:7687
ARKHITX_NEO4J_USER=neo4j
ARKHITX_NEO4J_PASSWORD=password
ARKHITX_PROJECT_ID=<returned by registration script>
```

---

## Key Rule

**ArkhitX governs. The project solves.**

ArkhitX adds audit trails, grounding scores, and knowledge graph context.
It does not build the solution. Projects work perfectly without ArkhitX —
governance is additive, never a blocker.

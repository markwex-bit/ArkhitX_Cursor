# ArkhitX Workspace

This workspace contains the **ArkhitX governance framework** and all AI projects built with it.

**Methodology → [METHODOLOGY.md](METHODOLOGY.md)** (canonical guide — read this first)

---

## Workspace Structure

```
ArkhitX_Cursor/
├── METHODOLOGY.md           ← Canonical methodology (start here)
├── WORKSPACE.md             ← You are here — workspace quick start
├── projects.json            ← Registry of all projects + auto-assigned ports
│
├── framework/               ← ArkhitX framework (internal — do not modify per project)
│   ├── backend/             ← ArkhitX governance API  (FastAPI)
│   ├── frontend/            ← ArkhitX governance dashboard (React)
│   ├── sdk/                 ← arkhitx-sdk Python package
│   └── docs/                ← Phase instruction docs (see framework/docs/README.md)
│
├── infrastructure/          ← Shared Docker services
│   └── docker-compose.yml   ← PostgreSQL · Neo4j · ArkhitX API · ArkhitX UI
│
├── scripts/
│   └── new_project.py       ← Scaffold a new project folder
│
└── projects/                ← One folder per AI application (build here first)
    ├── contract-review/     ← :3000 / api :8000
    ├── incident-classifier/ ← :3001 / api :8001
    ├── hr-policy-qa/        ← :3002 / api :8002
    └── supplier-risk/       ← :3003 / api :8003
```

**The separation is intentional:**
- `framework/` — ArkhitX infrastructure. Never touched when building a new project.
- `projects/` — Where all application work happens. Each project is fully self-contained.

**Build order:** Build the project in Phase 0 (standalone). Apply ArkhitX in Phases 1–3.

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

Creates `projects/my-new-app/` with a runnable skeleton (backend, frontend,
docker-compose, phase docs). This scaffolds a **project folder** — not ArkhitX
governance. Build domain logic in Phase 0 before registering with ArkhitX.

---

## Projects at a Glance

| Project             | What It Does                                   | Frontend | API   |
|---------------------|------------------------------------------------|----------|-------|
| contract-review     | Extract clauses, score risk, answer questions  | :3000    | :8000 |
| incident-classifier | Classify IT incidents, suggest resolutions     | :3001    | :8001 |
| hr-policy-qa        | Answer HR policy questions from uploaded docs  | :3002    | :8002 |
| supplier-risk       | Score supplier risk across 4 dimensions        | :3003    | :8003 |
| stellantis-ai-ba    | Stellantis AI BA Workbench                     | :3004    | :8004 |
| burdenfree          | BurdenFree                                     | :3005    | :8005 |
| initiative-workbench| Initiative Workbench                           | :3006    | :8006 |

See [projects.json](projects.json) for the full registry.

---

## The Six Phases

Every project follows the same lifecycle. See [METHODOLOGY.md](METHODOLOGY.md) for details.

| Phase | Name               | What Happens                                                | Dashboard |
|-------|--------------------|-------------------------------------------------------------|-----------|
| 0     | Build              | Build standalone AI app — no ArkhitX required               | —         |
| 1     | Register           | Extract ontology from code, register in ArkhitX             | Auto      |
| 2     | Populate Graph     | Seed Neo4j with domain knowledge for grounding              | Auto      |
| 3     | Wire Governance    | Install SDK, wrap agents with `GovernedBaseAgent`           | Auto      |
| 4     | Validate Grounding | End-to-end QA, confirm grounding scores                     | Manual    |
| 5     | Ship               | Verify dual mode, package handoff                           | Manual    |

Phase instruction docs: [framework/docs/README.md](framework/docs/README.md)

Each project's `docs/` folder contains project-specific phase notes.

---

## ArkhitX Methodology

Start with **[METHODOLOGY.md](METHODOLOGY.md)**. Phase deep-dives live in `framework/docs/`:

- `0A-ARCHITECTURE-AND-DESIGN.md` — Phase A: Architecture & Design (pre-build)
- `00-BUILD-SOLUTION.md` — Phase 0: Build the solution
- `01-REGISTER-ONTOLOGY.md` — Phase 1: Register and extract ontology
- `02-POPULATE-GRAPH.md` — Phase 2: Populate the graph
- `03-WIRE-GOVERNANCE.md` — Phase 3: Wire governance
- `04-VALIDATE-GROUNDING.md` — Phase 4: Validate grounding
- `05-SHIP.md` — Phase 5: Ship

Do not use documents in `framework/docs/archive/` — they describe a superseded model.

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

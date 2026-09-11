# Qlik to Power BI Migration Assessor

> An ArkhitX-governed AI application.

## What It Does

<!-- TODO: describe what this application does and who uses it -->

## Quick Start

```bash
# 1. Add your Anthropic API key
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=sk-ant-...

# 2. Build and run
docker-compose up --build
```

- Frontend: http://localhost:3008
- Backend API: http://localhost:8008
- API Docs: http://localhost:8008/docs

## Agents

| Agent | File | What It Does |
|-------|------|--------------|
| TODO  | `backend/app/agents/` | Add your agents here |

## Phase Roadmap

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Build | ✅ Scaffolded | Add domain logic |
| 1 — Register | ⏳ Pending | Create `ontology/qlik-pbi-migration.json` first |
| 2 — Populate | ⏳ Pending | Update `scripts/02_seed_graph.py` |
| 3 — Governance | ⏳ Pending | Wire after Phase 2 complete |

## ArkhitX Governance (Phase 3)

When ready to add governance:

```bash
# Start shared infrastructure
cd ../../infrastructure && docker-compose up -d

# Register this project
python scripts/01_register_project.py

# Seed the knowledge graph
python scripts/02_seed_graph.py

# Add ARKHITX_* values to .env, then restart
docker-compose up --build
```

See `docs/` for full phase documentation.

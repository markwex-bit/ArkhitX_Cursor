# Starter Template Guide

## Folder Structure

```
ArkhitX_Cursor/
├── backend/               ← ArkhitX core — NEVER modified per project
├── frontend/              ← ArkhitX governance UI — NEVER modified per project
├── Docs/                  ← Methodology files — NEVER modified per project
├── docker-compose.yml     ← ArkhitX services (PostgreSQL + Neo4j)
├── .env                   ← ArkhitX environment (API key, DB credentials)
│
└── projects/              ← All client engagements live here
    └── {project_slug}/    ← Created automatically at Phase 0 start
        ├── backend/       ← Solution's own FastAPI app (built in Phase 4)
        ├── frontend/      ← Solution's own React app (built in Phase 4)
        ├── samples/       ← Client data files (used in Phases 2-3)
        ├── docker-compose.yml  ← Solution's own services
        └── README.md
```

**The rule:** ArkhitX core files are infrastructure. They are never modified
per project. Every project lives in `projects/{project_slug}/` and is fully
isolated from every other project and from ArkhitX itself.

## What the Template Contains

This template provides boilerplate code that every project needs. Cursor extends
and customizes it for each client engagement by following the phase instruction files.

### Backend (`backend/`)

| File | Purpose | Cursor Extends It When... |
|------|---------|--------------------------|
| `app/main.py` | FastAPI app with CORS, lifespan, routers | Adding new API routers for solution agents |
| `app/config.py` | Environment-driven settings | Rarely — config covers most needs |
| `app/database.py` | PostgreSQL connection + session factory | Rarely — standard SQLAlchemy setup |
| `app/graph.py` | Neo4j connection + query execution | Adding domain-specific graph queries |
| `app/models/project.py` | Project model with phase tracking | Adding project-specific fields |
| `app/models/agent_prompt.py` | Agent prompt storage | Rarely — schema is stable |
| `app/models/audit_log.py` | Audit trail entries | Rarely — append-only log |
| `app/models/grounding_record.py` | Grounding score storage | Rarely — standard schema |
| `app/models/pipeline_event.py` | Pipeline step tracking | Rarely — standard schema |
| `app/models/client.py` | Client organization profiles | Adding client-specific metadata |
| `app/agents/base_agent.py` | Abstract agent with Claude calls, grounding, audit | Phase 4: creating solution agents |
| `app/services/prompt_service.py` | CRUD for agent prompts | Rarely — service is complete |
| `app/services/audit_service.py` | Audit log operations | Rarely — service is complete |
| `app/services/grounding_service.py` | Graph retrieval + grounding tracking | Phase 3-4: adding domain queries |
| `app/api/auth.py` | Login endpoint | Phase 1: replacing demo auth with real auth |
| `app/api/projects.py` | Project CRUD + gate decisions | Adding phase-specific endpoints |
| `app/api/governance.py` | Audit, grounding, pipeline, prompts API | Rarely — API is complete |
| `app/api/upload.py` | File upload handler | Phase 2: adding parsing logic |

### Frontend (`frontend/`)

| File | Purpose | Cursor Extends It When... |
|------|---------|--------------------------|
| `src/App.tsx` | Routing setup | Adding new pages |
| `src/components/Layout.tsx` | Sidebar navigation shell | Adding nav items |
| `src/components/PainPointForm.tsx` | 5-section pain point intake | Rarely — form is complete |
| `src/components/SignalReview.tsx` | Display extracted signals | Phase 0: adding edit/remove controls |
| `src/components/HITLGateOverlay.tsx` | Generic approval modal | Adding gate-specific review content |
| `src/pages/LoginPage.tsx` | Authentication | Replacing demo auth |
| `src/pages/ProjectsPage.tsx` | Project list + create | Rarely — page is complete |
| `src/pages/ProjectWorkspace.tsx` | Phase-aware project workspace | Each phase: adding phase-specific UI |
| `src/pages/GovernancePage.tsx` | Audit, grounding, pipeline tables | Adding filters, charts |
| `src/pages/ToolsPage.tsx` | Agent prompt editor | Rarely — page is complete |
| `src/lib/api.ts` | API client functions | Adding new API calls |
| `src/lib/stores/authStore.ts` | Auth state (Zustand) | Rarely — store is complete |
| `src/lib/stores/projectStore.ts` | Project state (Zustand) | Adding domain-specific state |
| `src/types/index.ts` | TypeScript types | Each phase: adding new types |

### Infrastructure

| File | Purpose | Cursor Extends It When... |
|------|---------|--------------------------|
| `docker-compose.yml` | PostgreSQL + Neo4j + backend + frontend | Adding new services (Redis, etc.) |
| `.env.example` | Environment variable template | Adding new config |
| `Dockerfile` (backend) | Python container | Adding system dependencies |
| `Dockerfile` (frontend) | Node container | Rarely |
| `.cursorrules` | Methodology rules for Cursor | Rarely — rules are stable |

## How Cursor Uses the Template

When you tell Cursor to follow a phase file (e.g., "Follow `docs/03-WIRE-GOVERNANCE.md`"),
Cursor will:

1. Read the phase file for instructions
2. Read `.cursorrules` for architectural rules
3. Look at the existing template code to understand patterns
4. Create new files (e.g., new agent files) following the established patterns
5. Modify existing files (e.g., adding routes to `main.py`) when needed
6. Never break the architectural rules in `.cursorrules`

## What Cursor Creates Per Project (Not in Template)

These are created by Cursor during the engagement, following the methodology:

| Phase | What Gets Created |
|-------|-------------------|
| 0 | Signal extraction agent (if not using inline LLM call) |
| 1 | Ontology schema (stored in project record) |
| 2 | Data mapping configuration, file parser customizations |
| 3 | Neo4j population scripts, Cypher schema setup |
| 4 | Solution agent files (one per BQ group), agent prompts |
| 5 | Validation test suite, grounding reports |
| 6 | Export endpoints, documentation generators |

## Extending the Template

### Adding a New Model

1. Create `backend/app/models/new_model.py`
2. Import it in `backend/app/models/__init__.py`
3. It will be auto-created on next startup (`init_db()` calls `create_all()`)

### Adding a New API Route

1. Create `backend/app/api/new_route.py` with a FastAPI `APIRouter`
2. Import and include it in `backend/app/main.py`

### Adding a New Agent

1. Create `backend/app/agents/my_agent.py` extending `BaseAgent`
2. Set `agent_name` to match the `agent_prompts.id` value
3. Seed the prompt in the database (via Tools page or seed script)
4. Add an API endpoint to invoke it

### Adding a New Frontend Page

1. Create `frontend/src/pages/NewPage.tsx`
2. Add a route in `frontend/src/App.tsx`
3. Add a nav item in `frontend/src/components/Layout.tsx`

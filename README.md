# ArkhitX — Governance & Grounding for AI Solutions

> **Build first. Govern after.**
>
> ArkhitX adds audit trails, grounding scores, knowledge graph context, and
> managed prompts to any AI solution — without changing how you build it.

---

## What ArkhitX Is

ArkhitX is a **governance and grounding layer**, not a solution builder. It sits
alongside your AI applications and makes them trustworthy:

| Layer | Technology | Purpose |
|---|---|---|
| Governance DB | PostgreSQL | Audit logs, grounding records, agent prompts |
| Knowledge Graph | Neo4j | Domain entities, relationships, ontology |
| SDK | Python (`arkhitx-sdk`) | Bridges any Python agent to both databases |
| Dashboard | React + FastAPI | Manage projects, inspect governance, run agents |

ArkhitX **governs itself** — its own seven rules are stored as `GovernanceRule`
nodes in Neo4j, and its own LLM calls are logged to its own audit trail.

---

## Quick Start

```bash
cd infrastructure

# Add your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Start all services
docker-compose up -d
```

| Service | URL | Credentials |
|---|---|---|
| Dashboard | http://localhost:8090 | `consultant@arkhitx.com` / `consultant123` |
| API docs | http://localhost:8080/docs | — |
| Neo4j Browser | http://localhost:7474 | `neo4j` / `password` |
| pgAdmin | `localhost:5432` | user: `user` / password: `password` / db: `arkhitx` |

---

## The Four-Phase Model

| Phase | Name | What Happens |
|---|---|---|
| **0** | Build | Build the solution with Cursor. No ArkhitX involved. |
| **1** | Register | Extract ontology from code. Register project. Seed agent prompts. |
| **2** | Seed Graph | Populate Neo4j with domain entities from `seed_data.json`. |
| **3** | Wire Governance | Agents inherit `GovernedBaseAgent`. Every LLM call is audited and grounded. |

The **Phase Gate Validator** agent enforces entry conditions — a project cannot
skip phases.

---

## The Seven Governance Rules

| ID | Rule | What It Enforces |
|---|---|---|
| RULE-001 | Audited | Every LLM call is logged to `audit_logs` |
| RULE-002 | Grounded | Agents query the knowledge graph before calling the LLM |
| RULE-003 | DB Prompts | System prompts live in `agent_prompts` table, never hardcoded |
| RULE-004 | Independent | Solutions run without ArkhitX; governance adds trust, not functionality |
| RULE-005 | Correct DBs | Domain data in Neo4j, governance data in PostgreSQL — never mixed |
| RULE-006 | No Workarounds | No band-aid patches, no special-casing, no TODO in production paths |
| RULE-007 | No Mocks | If the LLM fails, raise the error. Never return placeholder content |

These rules are stored as nodes in Neo4j so ArkhitX agents can ground against them.

---

## The SDK

```bash
pip install -e path/to/ArkhitX_Cursor/framework/sdk
```

### GovernedBaseAgent

Drop-in base class for any agent:

```python
from arkhitx import GovernedBaseAgent

class MyAgent(GovernedBaseAgent):
    agent_id = "my-agent"

    def _default_system_prompt(self) -> str:
        return "Fallback when DB record is missing."

    def _grounding_query(self, user_message: str) -> dict | None:
        return {"entity_type": "MyEntity", "depth": 1}

    def run(self, input: str) -> dict:
        return self.call_llm_json(f"Process: {input}")
        # ↑ Automatically: queries KG → injects context → calls LLM
        #                  → logs audit → stores grounding score
```

### Wiring an existing agent (3 steps)

**1. Set env vars** in your project's `.env`:
```bash
ARKHITX_DATABASE_URL=postgresql://user:password@localhost:5432/arkhitx
ARKHITX_NEO4J_URI=bolt://localhost:7687
ARKHITX_PROJECT_ID=<uuid from Dashboard registration>
```

**2. Inherit `GovernedBaseAgent`:**
```python
from arkhitx import GovernedBaseAgent, ArkhitXClient
import os

class BaseAgent(GovernedBaseAgent):
    def __init__(self):
        client = ArkhitXClient() if os.getenv("ARKHITX_DATABASE_URL") else None
        super().__init__(arkhitx=client)
```

**3. Override `_grounding_query()`** in agents that benefit from KG context:
```python
def _grounding_query(self, user_message: str) -> dict | None:
    return {"entity_type": "Contract", "depth": 1}
```

---

## The Six ArkhitX Agents

Accessible from **Tools → Agents** in the Dashboard. All six are self-governed.

### Setup agents (run once per project)

| Agent | What it does |
|---|---|
| **Ontology Extractor** | Reads project Python source and generates `ontology/{slug}.json` |
| **Grounding Query Generator** | Writes the `_grounding_query()` method for a specific agent |
| **Phase Gate Validator** | Checks all entry conditions before advancing to the next phase |

### Runtime quality gates

| Agent | What it does |
|---|---|
| **Compliance Detector** | Code audit — scans agent files against all 7 rules, pre-fills the Wiring Checklist |
| **Compliance Checker** | Real-time output gate — checks every AI response for rule violations |
| **Grounding Query Builder** | Builds a targeted Cypher query for the Compliance Checker per task |

---

## Dashboard

| Tab | What It Shows |
|---|---|
| **Applications** | All registered projects, phase status, on-disk health |
| Application detail | Phase timeline, audit logs, grounding scores, pipeline view, Wiring Checklist |
| **Governance** | Global audit log, grounding score history, pipeline view |
| **Tools → Prompts** | All agent prompts grouped by application — edit inline |
| **Tools → Database** | Table browser for `projects`, `agent_prompts`, `audit_logs`, `grounding_records` |
| **Tools → Agents** | Trigger any of the 6 ArkhitX agents; view results and call history |

The **Wiring Checklist** (Phase 3 detail) provides human-verified sign-off
against all 7 rules. Run "Scan Code" to pre-fill findings via the Compliance
Detector, then click "Mark Verified" to record sign-off with verifier name and
notes.

---

## Directory Structure

```
ArkhitX_Cursor/
├── framework/
│   ├── backend/             ArkhitX governance API (FastAPI)
│   │   └── app/
│   │       ├── agents/      6 internal ArkhitX agents
│   │       ├── api/         REST endpoints
│   │       └── models/      SQLAlchemy models
│   ├── frontend/            ArkhitX dashboard (React + Vite)
│   ├── governance/
│   │   ├── prompts.json     ArkhitX's own agent system prompts
│   │   └── seed_data.json   GovernanceRule + ProjectPhase KG nodes
│   ├── ontology/
│   │   └── arkhitx_framework.json  Self-governance ontology
│   └── sdk/                 arkhitx-sdk Python package
│       └── arkhitx/
│           ├── client.py           ArkhitXClient
│           ├── governed_agent.py   GovernedBaseAgent
│           └── graph_populator.py  GraphPopulator
│
├── infrastructure/
│   ├── docker-compose.yml   Shared services (PG, Neo4j, API, UI)
│   └── .env                 ANTHROPIC_API_KEY — never commit
│
├── projects/                One directory per governed application
│   └── {slug}/
│       ├── backend/
│       ├── frontend/
│       ├── ontology/{slug}.json
│       ├── governance/
│       │   ├── prompts.json
│       │   └── seed_data.json
│       ├── .env
│       └── README.md        ← application-specific documentation
│
├── projects.json            Workspace registry
└── .cursorrules             ArkhitX methodology for AI sessions
```

---

## Tech Stack

| Component | Technology |
|---|---|
| Governance database | PostgreSQL 16 |
| Knowledge graph | Neo4j 5 + APOC |
| LLM | Anthropic Claude |
| SDK | Python 3.11 |
| API | FastAPI + SQLAlchemy |
| Dashboard | React 18 + TypeScript + Vite + Tailwind CSS |
| Containers | Docker + Docker Compose |

---

## Registered Applications

See each project's own `README.md` for usage, agents, API endpoints, and samples.

| Application | Directory | README |
|---|---|---|
| Contract Review Assistant | `projects/contract-review/` | [README](projects/contract-review/README.md) |
| HR Policy Q&A | `projects/hr-policy-qa/` | [README](projects/hr-policy-qa/README.md) |
| IT Incident Classifier | `projects/incident-classifier/` | [README](projects/incident-classifier/README.md) |
| Supplier Risk Assessor | `projects/supplier-risk/` | [README](projects/supplier-risk/README.md) |

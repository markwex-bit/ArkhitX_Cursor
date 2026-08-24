# ArkhitX Methodology

## For Consultants — Read This First

ArkhitX is a **governance and grounding layer** for AI-powered solutions. It is
not the solution itself. It is the infrastructure that makes solutions trustworthy.

You build solutions the way you normally would — with Cursor, with your favorite
stack, iterating quickly until the thing works. Then you retrofit ArkhitX to add
governance (audit trails, prompt management, grounding scores) and grounding
(knowledge graph context for your agents).

This is "build first, govern after." The ontology comes from working code, not
from speculation.

### What ArkhitX Provides

1. **A governance database (PostgreSQL)** — audit trails for every agent call,
   managed prompts you can tune without code changes, grounding scores that
   prove your AI isn't hallucinating.

2. **A knowledge graph (Neo4j)** — your solution's domain model as nodes and
   edges. Agents query this for grounded context instead of guessing.

3. **A governance SDK** — a Python package (`arkhitx-sdk`) any project can
   install. Drop-in base agent that wraps LLM calls with audit logging and
   grounding. One import change, full governance.

4. **A governance dashboard** — the ArkhitX UI shows audit logs, grounding
   scores, agent prompts, and project status across all your engagements.

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Your Solution (React + FastAPI, or whatever stack you use) │
│                                                             │
│  Agents extend GovernedBaseAgent from arkhitx-sdk           │
│  ↓ audit logs     ↓ grounding queries     ↓ prompt loads   │
├──────────────────────┬──────────────────────────────────────┤
│  PostgreSQL          │  Neo4j Knowledge Graph               │
│  (governance)        │  (grounding)                         │
│  - audit_logs        │  - domain entities                   │
│  - grounding_records │  - relationships                     │
│  - agent_prompts     │  - ontology constraints              │
│  - pipeline state    │                                      │
├──────────────────────┴──────────────────────────────────────┤
│  ArkhitX Dashboard (React UI)                               │
│  - View audit trails across projects                        │
│  - Monitor grounding scores                                 │
│  - Edit agent prompts                                       │
│  - Track project phases                                     │
└─────────────────────────────────────────────────────────────┘
```

### The Phases

| Phase | Name | What Happens |
|-------|------|--------------|
| 0 | Build the Solution | You build your POC/MVP with Cursor. No ArkhitX involved yet. |
| 1 | Register Project | Register the project in ArkhitX. Extract the ontology from the working code. |
| 2 | Populate Graph | Import domain data into Neo4j as nodes and edges. |
| 3 | Wire Governance | Install `arkhitx-sdk`, modify agents to use `GovernedBaseAgent`. |
| 4 | Validate Grounding | Run the solution, verify grounding scores meet the bar. |
| 5 | Ship | Solution is production-ready with full governance. |

**Phase 0 is yours.** Build whatever you want, however you want. ArkhitX does
not constrain your technology choices, your architecture, or your workflow.

**Phase 1 is extraction, not design.** The ontology comes FROM the working
code. You analyze what entities and relationships actually exist in your
solution and formalize them as a schema. This is concrete, not speculative.

**Phases 2-3 are integration.** You connect your solution to ArkhitX's
infrastructure. Your agents start logging to PostgreSQL and querying Neo4j.

**Phases 4-5 are validation and delivery.** You verify the integration works,
grounding scores are acceptable, and the solution is production-ready.

### Retrofitting an Existing Solution

If you already have a working solution (like a POC the client approved):

1. **Install the SDK:**
   ```
   pip install arkhitx-sdk  # or add as a local path dependency
   ```

2. **Set environment variables:**
   ```
   ARKHITX_DATABASE_URL=postgresql://user:password@localhost:5432/arkhitx
   ARKHITX_NEO4J_URI=bolt://localhost:7687
   ARKHITX_PROJECT_ID=<your-project-uuid>
   ```

3. **Run the registration script:**
   The SDK includes scripts to register your project, extract the ontology,
   and populate Neo4j.

4. **Modify your base agent:**
   Your agents check for `ARKHITX_DATABASE_URL` at startup. If present, they
   automatically wrap LLM calls with audit logging and grounding. If absent,
   they run standalone — no ArkhitX dependency required.

5. **Override `_grounding_query()` in agents that benefit from KG context.**

### What the Client Gets

- **The solution** — the application they use daily, running independently.
- **Full governance** — every agent call logged, every response grounding-scored.
- **Tunable AI** — agent prompts editable through the ArkhitX dashboard.
- **Auditable history** — compliance teams can trace any AI decision to source data.

### Prerequisites

- **Cursor** — the AI IDE (cursor.com)
- **Docker Desktop** — for running PostgreSQL, Neo4j, and the ArkhitX dashboard
- **An Anthropic API key** — for Claude LLM access
- **A working solution** — or a project you're ready to build

No coding experience required for the ArkhitX integration. The SDK handles the
wiring. Cursor builds the solution. You make the strategic decisions.

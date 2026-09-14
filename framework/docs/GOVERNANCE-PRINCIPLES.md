# Governance Principles

## Why Governance Matters

A solution without governance is a demo. Governance is what makes AI trustworthy
in production: every decision is logged, every answer is traceable, every agent
is configurable without code changes.

This document defines the governance database schema and the rules for using it.

See [METHODOLOGY.md](../../METHODOLOGY.md) for the six-phase build-first workflow.

## Essential Governance Schema (Level 1)

Every project gets these tables. Created when a project is registered with ArkhitX.

### `projects`

Tracks each client engagement and its current phase.

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    description TEXT,
    current_phase INTEGER DEFAULT 0 CHECK (current_phase BETWEEN 0 AND 5),
    phase_status VARCHAR(50) DEFAULT 'in_progress',
    ontology_schema JSONB DEFAULT '{}',
    pain_points JSONB DEFAULT '{}',
    signals JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `agent_prompts`

All LLM system prompts. Agents load these at runtime — never hardcode prompts.

```sql
CREATE TABLE agent_prompts (
    id VARCHAR(100) PRIMARY KEY,
    agent_name VARCHAR(100) NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    model VARCHAR(100) DEFAULT 'claude-sonnet-4-20250514',
    max_tokens INTEGER DEFAULT 4096,
    temperature FLOAT DEFAULT 0.3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `audit_logs`

Every significant decision. Non-negotiable — if it changes state, it gets logged.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    actor VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id VARCHAR(255),
    context JSONB DEFAULT '{}',
    result JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**What gets logged:**
- Agent calls (action: `agent_call:{agent_name}`)
- HITL gate approvals (action: `gate_approved:{gate_name}`)
- HITL gate rejections (action: `gate_rejected:{gate_name}`)
- Schema changes (action: `schema_updated`)
- Data imports (action: `data_imported:{source}`)
- Phase transitions (action: `phase_advanced:{from}:{to}`)
- Prompt updates (action: `prompt_updated:{agent_name}`)

### `grounding_records`

Links every agent response to the graph data that supports it.

```sql
CREATE TABLE grounding_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_name VARCHAR(100) NOT NULL,
    query_path TEXT,
    cited_nodes JSONB DEFAULT '[]',
    cited_edges JSONB DEFAULT '[]',
    node_count INTEGER DEFAULT 0,
    grounding_score FLOAT CHECK (grounding_score BETWEEN 0 AND 1),
    response_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Grounding score calculation:**
- 1.0 = Every claim in the response is directly supported by a cited graph node
- 0.7-0.99 = Most claims grounded, some inferred from adjacent context
- 0.4-0.69 = Partial grounding, significant LLM reasoning beyond graph data
- 0.0-0.39 = Mostly LLM reasoning, minimal graph support (flag for review)

### `pipeline_events`

Tracks pipeline execution for the governance dashboard.

```sql
CREATE TABLE pipeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    phase INTEGER NOT NULL,
    step_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'started',
    input_summary JSONB DEFAULT '{}',
    output_summary JSONB DEFAULT '{}',
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `clients`

Client organization profiles. A client can have multiple projects.

```sql
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) UNIQUE NOT NULL,
    industry VARCHAR(100),
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN client_id UUID REFERENCES clients(id);
```

## Extended Governance Schema (Level 2)

Add these tables when the engagement requires full governance — compliance-heavy
industries, large enterprises, or when the client's audit requirements demand it.

### `agent_contracts`

Formal input/output contracts per agent. Validates that agents receive correct
inputs and produce correctly structured outputs.

```sql
CREATE TABLE agent_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name VARCHAR(100) NOT NULL,
    input_schema JSONB NOT NULL,
    output_schema JSONB NOT NULL,
    validation_rules JSONB DEFAULT '[]',
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `prompt_versions`

Full version history of prompt changes (Level 1 only tracks latest).

```sql
CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id VARCHAR(100) REFERENCES agent_prompts(id),
    version INTEGER NOT NULL,
    system_prompt TEXT NOT NULL,
    changed_by VARCHAR(255),
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `gate_decisions`

Detailed HITL gate decision records with reviewer notes.

```sql
CREATE TABLE gate_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    gate_name VARCHAR(100) NOT NULL,
    phase INTEGER NOT NULL,
    decision VARCHAR(50) NOT NULL,
    reviewer VARCHAR(255) NOT NULL,
    notes TEXT,
    items_reviewed JSONB DEFAULT '{}',
    items_modified JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `llm_usage_logs`

Token usage and cost tracking per LLM call.

```sql
CREATE TABLE llm_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_name VARCHAR(100),
    model VARCHAR(100),
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost FLOAT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Governance Rules

### Rule 1: No Silent Failures

If an agent call fails, the error is logged to `audit_logs` with the full context.
The system never silently swallows errors or returns fallback content.

### Rule 2: Grounding Is Mandatory

Every agent that answers a business question must produce a grounding record.
Agents that perform utility tasks (parsing, formatting) are exempt but should
still log to `audit_logs`.

### Rule 3: Prompts Are Data

Agent prompts are treated as data, not code. They are:
- Stored in PostgreSQL
- Loaded at runtime
- Editable through the governance dashboard (Tools page)
- Never modified by editing Python source files

### Rule 4: Phase Gates Are Enforced

Integration phases (0–3) cannot be skipped. The **Phase Gate Validator** agent
checks entry conditions (files on disk, DB rows, Neo4j nodes, audit events). The
dashboard auto-detects progress through Phase 3. Phases 4–5 (validate, ship) are
consultant sign-off milestones documented in [04-VALIDATE-GROUNDING.md](04-VALIDATE-GROUNDING.md) and
[05-SHIP.md](05-SHIP.md).

### Rule 5: Audit Trail Is Append-Only

`audit_logs` rows are never updated or deleted. They are the permanent record.
If a decision is reversed, a new log entry is created (e.g., `gate_reopened`).

## Governance Dashboard

The ArkhitX dashboard runs at **http://localhost:8090**. It shows:

- **Applications** — registered projects, phase status (auto-detected through Phase 3)
- **Audit Log** — searchable log of all agent calls and governance events
- **Grounding** — per-agent grounding score history
- **Tools → Prompts** — view and edit agent prompts
- **Tools → Agents** — run ArkhitX internal agents (Compliance Detector, Phase Gate Validator, etc.)

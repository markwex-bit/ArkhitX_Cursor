# Architecture Principles

## The Four Layers

Every solution built with this methodology has exactly four layers. This is not a
suggestion — it is a structural requirement. Mixing layers produces ungoverned,
unauditable systems.

### Layer 1: Ontology (Schema Definition)

**What it does:** Defines what CAN exist in the solution. Entity types, relationship
types, property schemas, and constraints.

**Where it lives:** Encoded in Neo4j as label constraints and property definitions.
Documented in the project's schema files.

**Rules:**
- If an entity type isn't defined in the ontology, it cannot be created in the graph
- Properties have defined types (string, number, date, enum) — no untyped fields
- Relationships have defined direction and cardinality
- The ontology is extracted from working code in Phase 1, never from generic templates or speculative design

**Implementation guidance for Cursor:**
- Store the ontology definition as a JSON file in `projects/{slug}/ontology/` and in PostgreSQL (`project.ontology_schema`) after registration
- When creating Neo4j nodes, validate against the schema before writing
- Ontology changes after Phase 1 registration should be deliberate and re-validated against the graph

### Layer 2: Knowledge Graph (Neo4j)

**What it does:** Holds what DOES exist. Real client data as nodes and edges that
agents traverse for grounded answers.

**Where it lives:** Neo4j. Each project gets its own graph space (label-prefixed or
separate database).

**Rules:**
- Only domain data goes in Neo4j — client entities, relationships, instances
- No governance data in Neo4j — no prompts, no configs, no audit logs
- Every node must conform to the ontology schema
- Every relationship must connect valid entity types per the schema
- Nodes carry source metadata (which file, which field, when imported)

**Implementation guidance for Cursor:**
- Use the `neo4j` Python driver via `graph_service.py`
- Namespace nodes per project: `MATCH (e:proj_{project_id}_Supplier)` or use separate
  Neo4j databases per project
- Always include `_source_file`, `_imported_at`, `_project_id` properties on nodes
- Create indexes on frequently queried properties

### Layer 3: Grounding (SDK)

**What it does:** Provides structured context to LLM calls. When an agent needs to
answer a question, it queries the knowledge graph and assembles relevant nodes
into prompt context before calling the LLM.

**Where it lives:** Implemented in the SDK via `GovernedBaseAgent._grounding_query()`
and `ArkhitXClient.get_grounding_context()` (`framework/sdk/arkhitx/`).

**Rules:**
- LLMs never receive raw database dumps — they receive curated retrieval results
- Every retrieval includes the query/index used, so the path is auditable
- Retrieval results are structured JSON with node properties, not flattened text
- The retrieval scope is defined per agent — override `_grounding_query()` in each
  agent subclass; return `None` to skip grounding for that call
- **Every non-`None` `_grounding_query()` must declare a `retrieval_strategy`.**
  This is enforced structurally — `GovernedBaseAgent.call_llm()` raises
  `ValueError` if it's missing or invalid. Graph traversal is never the silent
  default; it must be a deliberate choice per agent, made against the table below.

**Retrieval strategy selection — choose per agent, not once per project:**

The "ask" each agent answers determines the right retrieval method. Classify
the ask, then pick the strategy — don't default to graph traversal just
because Neo4j is the knowledge store.

| Ask pattern | Example | `retrieval_strategy` | Requires |
|---|---|---|---|
| Multi-hop relationships, lineage, impact | "What depends on X?" | `graph` | `entity_type`, optional `filters`/`depth` |
| Exact record lookup, no traversal | "Fetch record by id" | `structured` | `entity_type`, `filters` |
| Semantic similarity over unstructured text | "Find the record that means the same thing" | `vector` | `vector_index`, `query_embedding` |
| Structural candidates ranked by meaning | "Narrow by relationship, rank by similarity" | `hybrid` | graph fields + `query_embedding` |

Do this classification explicitly as part of Phase 3 wiring (see
`04-AGENT-BUILD.md`, "Step 0") and document the choice + rationale per agent
in the project's `docs/PHASE-3-GOVERNANCE.md`.

**Implementation guidance for Cursor:**
- Override `_grounding_query()` per agent, e.g.
  `{"entity_type": "...", "filters": {...}, "depth": n, "retrieval_strategy": "graph"}`
- `GovernedBaseAgent.call_llm()` handles context injection, audit logging, and grounding scores automatically
- `ArkhitXClient.get_grounding_context()` dispatches on `retrieval_strategy` — see `framework/sdk/arkhitx/client.py`
- Store retrieval metadata in `grounding_records` via the SDK (no manual wiring needed)

**Cross-cutting pattern: confidence-tiered human-in-the-loop gates**

Many solutions need a mandatory human sign-off step before an AI-derived
disposition takes effect (e.g. a migration/remediation/approval decision).
This isn't a fifth layer — it's a Phase 0 solution-design pattern that Phase 3
governance wires up:

- In the solution (Phase 0): tier agent outputs by confidence (e.g. high/medium/low)
  and require an explicit human decision before any tier's disposition is
  considered final — never auto-apply a low-confidence AI judgment.
- In governance (Phase 3): log every gate decision to the `gate_decisions`
  table (see `GOVERNANCE-PRINCIPLES.md`) with `reviewer`, `decision`, and
  `items_reviewed`/`items_modified` — the audit trail must show a human, not
  just the model, approved the outcome.
- This pattern was extracted from a working sign-off gate built in Phase 0 of
  a real project, per the "ontology/patterns from working code" principle —
  not designed speculatively up front.

### Layer 4: Governance (PostgreSQL)

**What it does:** Controls LLM behavior and tracks every decision. This is the
system's memory and accountability layer.

**Where it lives:** PostgreSQL. Standard relational tables.

**Rules:**
- All agent prompts are database-managed — the `agent_prompts` table
- All significant decisions are logged — the `audit_logs` table
- All agent responses include grounding scores — the `grounding_records` table
- Pipeline state is tracked — the `pipeline_events` table
- Nothing governance-critical is hardcoded in Python or TypeScript

**Implementation guidance for Cursor:**
- See `docs/GOVERNANCE-PRINCIPLES.md` for the full table schema
- Every API endpoint that changes state must create an audit log entry
- Every agent call must create a grounding record
- Prompt changes are versioned (soft-update with `updated_at`, not overwrite)

## When to Use What

| Data Type | Storage | Why |
|-----------|---------|-----|
| Client entities (Supplier, Order, Product) | Neo4j | Graph traversal for agent grounding |
| Entity relationships (SUPPLIES, CONTAINS) | Neo4j | Relationship traversal |
| Agent prompts | PostgreSQL | Governance, versioning, runtime loading |
| Audit trail | PostgreSQL | Structured querying, compliance reporting |
| Grounding scores and citations | PostgreSQL | Performance tracking, trust metrics |
| Pipeline state (which phase, gate status) | PostgreSQL | Workflow management |
| User accounts and auth | PostgreSQL | Standard relational data |
| File upload metadata | PostgreSQL | Reference tracking |
| Uploaded file content (parsed) | PostgreSQL (JSON) then Neo4j (instances) | Parse to JSON first, then map to graph |

## Technology Choices

These are fixed for every project built with this kit:

| Component | Technology | Why |
|-----------|-----------|-----|
| Backend API | FastAPI | Async, auto-docs, Python ecosystem |
| Governance DB | PostgreSQL | Mature, relational, great for audit/governance |
| Knowledge Graph | Neo4j | Purpose-built graph DB, Cypher query language |
| LLM | Anthropic Claude | Strong reasoning, structured output, tool use |
| Frontend | React + TypeScript + Vite | Fast dev, type safety, modern tooling |
| Containers | Docker Compose | Reproducible multi-service setup |

## Project Isolation

Each client engagement is a separate project. Projects are isolated:
- Separate Neo4j database or label namespace
- `project_id` foreign key on all PostgreSQL governance tables
- No cross-project data leakage
- A project can be exported or deleted independently

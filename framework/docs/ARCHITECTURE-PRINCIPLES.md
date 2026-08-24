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
- The ontology is designed from client signals, never from generic templates

**Implementation guidance for Cursor:**
- Store the ontology definition as a JSON schema in PostgreSQL (`project.ontology_schema`)
  for governance, and enforce it when writing to Neo4j
- When creating Neo4j nodes, validate against the schema before writing
- When the consultant approves the ontology at the Phase 1 gate, lock it — no schema
  changes without explicit re-approval

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

### Layer 3: Retrieval (GraphRAG)

**What it does:** Provides structured context to LLM calls. When an agent needs to
answer a question, GraphRAG traverses the knowledge graph and assembles relevant
nodes and edges into a structured prompt context.

**Where it lives:** Service layer between agents and Neo4j. Implemented in
`grounding_service.py`.

**Rules:**
- LLMs never receive raw database dumps — they receive curated graph traversal results
- Every retrieval includes the Cypher query used, so the path is auditable
- Retrieval results are structured (JSON with node properties, relationship types,
  path descriptions), not flattened text
- The retrieval scope is defined by the agent's purpose — a supplier risk agent
  retrieves supplier subgraphs, not the entire graph

**Implementation guidance for Cursor:**
- Build retrieval functions per agent purpose (e.g., `retrieve_supplier_risk_context`,
  `retrieve_order_status_context`)
- Each function returns: `{ nodes: [...], edges: [...], query_path: "MATCH ...",
  traversal_depth: N }`
- Pass retrieval results as structured context in the agent's user message
- Store the retrieval result hash in `grounding_records` for auditability

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

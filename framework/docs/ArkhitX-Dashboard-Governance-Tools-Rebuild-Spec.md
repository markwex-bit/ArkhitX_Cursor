# ArkhitX Dashboard — Governance + Tools Rebuild Spec



**Status:** Complete (Sprints 0–4)  

**Created:** 2026-03-15  

**Goal:** Make ArkhitX Dashboard look and operate like AIASA Governance + Tools tabs — modern, dark, consultant-grade — while staying **playbook-scoped** (no agent factory).



**Reference UI:** `AIASA/frontend` — Governance page, DBTablesTab, AgentsTab  

**Target:** `framework/frontend` + `framework/backend`

**Shared UI for all apps:** Solution project frontends use the same tokens and theme toggle — see [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) (`framework/design-system/`).



---



## Progress summary



| Sprint | Focus | Status |

|--------|-------|--------|

| 0 | Design system + layout shell | ✅ Complete |

| 1 | Backend schema + APIs | ✅ Complete |

| 2 | Governance UI (4 tabs) | ✅ Complete |

| 3 | Tools UI (Governance Data + Agents) | ✅ Complete |

| 4 | RAG strategy + polish | ✅ Complete |



**Legend:** ⬜ Not started · 🔄 In progress · ✅ Complete



---



## Design principles



| Principle | AIASA cue | ArkhitX adaptation |

|-----------|-----------|-------------------|

| Dark, dense UI | `--ax-*` CSS tokens, 10–11px tables | Port tokens to ArkhitX frontend |

| Tabbed workspaces | 4 Governance tabs + project selector | Same shell; playbook content |

| Sticky stats bar | Tokens, gates, errors, live | Phase progress, LLM calls, grounding, gates |

| Expandable rows | JSON cells, audit detail | Audit, grounding, gate records |

| No factory UI | 30-step agent roadmap | Phase roadmap (A, 0–5) only |



---



## Sprint 0 — Design system foundation



- [x] Copy `--ax-*` CSS variables from AIASA → `framework/frontend/src/index.css`

- [x] Merge `ax` color map into `framework/frontend/tailwind.config.js`

- [x] Add `tailwindcss-animate` dependency

- [x] Add `cn()` utility (`lib/utils.ts`)

- [x] Create `components/ui/` primitives:

  - [x] `ScrollArea`

  - [x] `StatusBadge`

  - [x] `ScoreBadge`

  - [x] `TabBar`

  - [x] `ProjectSelector`

  - [x] `ExplanationBanner`

  - [x] `DataTable` (sort, scroll, columns)

  - [x] `JsonCell`

- [x] Redesign `components/Layout.tsx` (dark theme, AIASA-style nav)

- [x] Verify Applications + Projects pages render with new shell (harmony design pass)



---



## Sprint 1 — Backend schema & API



### Database



- [x] Add `gate_decisions` table + model

- [x] Add `llm_usage_logs` table + model

- [x] Add `retrieval_strategy` JSONB on `projects` (per-agent map: graph | structured | vector | hybrid)

- [ ] (Optional Phase 1b) Add `prompt_versions` table + model

- [x] Idempotent migration in `database.py`



### SDK



- [x] Log `input_tokens` / `output_tokens` from Anthropic response in `GovernedBaseAgent`

- [x] Write to `llm_usage_logs` + enrich `audit_logs.context`

- [x] Respect per-agent `retrieval_strategy` from project config (project overrides agent spec via `resolve_agent_retrieval_strategy`)



### Governance API (`/api/governance/`)



- [x] `GET /gates?project_id=` — gate history

- [x] `GET /llm-usage?project_id=` — token/cost rows + summary

- [x] `GET /lineage/{project_id}` — playbook lineage chain

- [x] Extend `POST .../gates/.../decide` to insert `gate_decisions`



### Admin data API (`/api/admin/data/`)



- [x] Whitelist-only table browser (NOT full schema like AIASA)

- [x] `GET /tables` — metadata + row counts

- [x] `GET /tables/{name}/rows` — paginated, project-scoped

- [x] `PUT /tables/{name}/rows/{id}` — editable tables only

- [x] `POST /tables/{name}/rows` — editable tables only



**Editable tables:** `projects`, `agent_prompts`, `architecture_documents`, `architecture_decisions`  

**Read-only:** `audit_logs`, `grounding_records`, `gate_decisions`, `llm_usage_logs`, `pipeline_events`



---



## Sprint 2 — Governance page (4 tabs)



Replace `pages/GovernancePage.tsx` with AIASA-style shell.



### Shell



- [x] Tab bar: Overview · Approvals · Lineage · Audit Log

- [x] Project selector + refresh (all tabs)

- [x] `lib/stores/governanceStore.ts`



### Overview tab



- [x] Top stats bar: phase, LLM calls, tokens, avg grounding, gates, pending

- [x] Phase roadmap table (A, 0–5) — collapsible sections (`PhaseRoadmapTable.tsx`)

- [x] Expand row → recent pipeline_events + audit entries for phase

- [x] Grounding score distribution (simple bar)

- [x] Show per-project retrieval strategy summary (not all projects use Graph RAG)



### Approvals tab



- [x] Pending gates derived from project state (`PendingGatesPanel.tsx`)

- [x] History from `gate_decisions` (reviewer, notes, conditions)

- [x] Expand row → full JSON + link to Project Workspace

- [x] Gate names: `architecture_gate`, `signal_gate`, `schema_gate`, etc. (via `GATE_NAMES`)



### Lineage tab



- [x] Visual flow: Intake → Architecture → ontology.json → seed → RAG strategy → Governed agents

- [x] Node click → detail panel

- [x] Include retrieval strategy node (which RAG variants this project uses)



### Audit Log tab



- [x] Port AIASA filters: All | Errors | LLM | Gates

- [x] Actor/agent dropdown

- [x] Expandable `context` / `result` JSON (`JsonCell`)

- [x] Token columns (from audit context)

- [x] CSV export

- [x] Immutable — no edit/delete



### Grounding drill-down



- [x] Drawer/modal: cited nodes, query_path, response_summary, score (`GroundingDetailDrawer.tsx`)

- [x] Accessible from Overview detail link



---



## Sprint 3 — Tools page (3 tabs)



### Governance Data tab



- [x] Port AIASA `DBTablesTab` layout (scoped whitelist)

- [x] Table list grouped: PROJECT | GOVERNANCE | SYSTEM

- [x] Row count badges

- [x] Warning banner: audit logs immutable

- [x] Project filter scopes all queries

- [x] JSONB cell expand

- [x] Inline edit on editable tables

- [x] Pagination (50) + column sort



### Agents tab



- [x] Extract `FrameworkAgentsTab.tsx` — dark card layout

- [x] Keep: Ontology Extractor, Compliance Detector, Grounding Query Generator/Builder, Compliance Checker, Phase Gate Validator

- [x] Recent runs strip (last 3 audit entries per agent)



### Prompts



- [x] Primary edit via Governance Data → `agent_prompts` table (banner in Prompts tab)

- [x] Quick edit retained in Prompts tab



---



## Sprint 4 — RAG strategy & polish



### Per-project retrieval strategy (explicit)



Not every project uses Graph RAG. Capture in Phase A, store on project, surface in Dashboard.



- [x] `projects.retrieval_strategy` JSONB schema:

  ```json

  {

    "default": "hybrid",

    "agents": {

      "migration_advisor_agent": "graph",

      "semantic_match_agent": "vector",

      "ingestion_service": "structured"

    }

  }

  ```

- [ ] Phase A architecture doc captures strategy (link to Retrieval / Grounding Strategy doc) — project-level doc, not dashboard

- [x] Project Workspace: view/edit strategy map (`RetrievalStrategyPanel.tsx`)

- [x] Lineage tab shows strategy per agent

- [x] SDK `GovernedBaseAgent` reads strategy before `_grounding_query()`

- [x] Governance Overview: badge when project uses non-graph default

- [x] Grounding scores annotated: "N/A by design" for vector/structured-only agents



### Polish



- [x] Restyle Applications + Projects pages to dark theme

- [x] Restyle ProjectWorkspace to match

- [x] Remove dead `DatabaseTab` from ToolsPage

- [x] Theme leak fixes (DocumentList, SignalReview, agent result renderers)

- [ ] End-to-end test with `qlik-pbi-migration` project (manual QA)



---



## Explicitly out of scope



- [x] ~~30-step AIASA agent pipeline dashboard~~

- [x] ~~SSE live pipeline (optional later)~~

- [x] ~~Territory/document reset utilities~~

- [x] ~~Full 64-table PostgreSQL browser~~

- [x] ~~Export package ZIP (deferred)~~

- [x] ~~Neo4j data editing in Tools~~



---



## Success criteria



- [x] Governance feels like AIASA: dark, 4 tabs, project selector, expandable audit

- [x] Overview shows playbook phases A→5 (not OSA/OPA steps)

- [x] Lineage traces intake → docs → ontology → graph → governed calls

- [x] Tools → Governance Data: edit prompts/projects; read-only audit/grounding

- [x] Token counts appear after governed agent runs

- [x] Gate approvals in Approvals tab with reviewer notes

- [x] Retrieval strategy visible and enforced — Graph RAG not assumed for every agent



---



## File map (target structure)



```

framework/frontend/src/

├── components/

│   ├── governance/

│   │   ├── GovernanceOverviewTab.tsx

│   │   ├── GovernanceApprovalsTab.tsx

│   │   ├── GovernanceLineageTab.tsx

│   │   ├── GovernanceAuditLogTab.tsx

│   │   ├── GroundingDetailDrawer.tsx

│   │   └── PhaseRoadmapTable.tsx

│   ├── project/

│   │   └── RetrievalStrategyPanel.tsx

│   └── tools/

│       ├── GovernanceDataTab.tsx

│       └── FrameworkAgentsTab.tsx

├── lib/

│   ├── governanceUtils.ts

│   └── stores/governanceStore.ts

└── pages/

    ├── GovernancePage.tsx

    └── ToolsPage.tsx



framework/backend/app/

├── models/gate_decision.py

├── models/llm_usage_log.py

├── api/admin/data_tables.py

└── services/lineage_service.py

```



---



## Changelog



| Date | Item | Status |

|------|------|--------|

| 2026-03-15 | Spec created (pre-rebuild checkpoint) | ✅ |

| 2026-03-16 | Sprints 0–3 core + harmony design + RAG strategy SDK | ✅ |

| 2026-09-14 | Sprint 2–4 completion: drawer, lineage flow, audit CSV, FrameworkAgentsTab, RAG UI | ✅ |



---



*Update checkboxes and Progress summary as work completes. Say "Update progress: [item]" in Cursor to mark items done.*


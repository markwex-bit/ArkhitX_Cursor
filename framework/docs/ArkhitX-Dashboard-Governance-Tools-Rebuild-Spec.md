# ArkhitX Dashboard — Governance + Tools Rebuild Spec

**Status:** Planning (pre-implementation checkpoint)  
**Created:** 2026-03-15  
**Goal:** Make ArkhitX Dashboard look and operate like AIASA Governance + Tools tabs — modern, dark, consultant-grade — while staying **playbook-scoped** (no agent factory).

**Reference UI:** `AIASA/frontend` — Governance page, DBTablesTab, AgentsTab  
**Target:** `framework/frontend` + `framework/backend`

---

## Progress summary

| Sprint | Focus | Status |
|--------|-------|--------|
| 0 | Design system + layout shell | ⬜ Not started |
| 1 | Backend schema + APIs | ⬜ Not started |
| 2 | Governance UI (4 tabs) | ⬜ Not started |
| 3 | Tools UI (Governance Data + Agents) | ⬜ Not started |
| 4 | RAG strategy + polish | ⬜ Not started |

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

- [ ] Copy `--ax-*` CSS variables from AIASA → `framework/frontend/src/index.css`
- [ ] Merge `ax` color map into `framework/frontend/tailwind.config.js`
- [ ] Add `tailwindcss-animate` dependency
- [ ] Add `cn()` utility (`lib/utils.ts`)
- [ ] Create `components/ui/` primitives:
  - [ ] `ScrollArea`
  - [ ] `StatusBadge`
  - [ ] `ScoreBadge`
  - [ ] `TabBar`
  - [ ] `ProjectSelector`
  - [ ] `ExplanationBanner`
  - [ ] `DataTable` (sort, paginate, expand)
  - [ ] `JsonCell`
- [ ] Redesign `components/Layout.tsx` (dark theme, AIASA-style nav)
- [ ] Verify Applications + Projects pages render with new shell (restyle later OK)

---

## Sprint 1 — Backend schema & API

### Database

- [ ] Add `gate_decisions` table + model
- [ ] Add `llm_usage_logs` table + model
- [ ] Add `retrieval_strategy` JSONB on `projects` (per-agent map: graph | structured | vector | hybrid)
- [ ] (Optional Phase 1b) Add `prompt_versions` table + model
- [ ] Idempotent migration in `database.py`

### SDK

- [ ] Log `input_tokens` / `output_tokens` from Anthropic response in `GovernedBaseAgent`
- [ ] Write to `llm_usage_logs` + enrich `audit_logs.context`
- [ ] Respect per-agent `retrieval_strategy` from project config (skip graph query when not `graph`/`hybrid`)

### Governance API (`/api/governance/`)

- [ ] `GET /gates?project_id=` — gate history
- [ ] `GET /llm-usage?project_id=` — token/cost rows + summary
- [ ] `GET /lineage/{project_id}` — playbook lineage chain
- [ ] Extend `POST .../gates/.../decide` to insert `gate_decisions`

### Admin data API (`/api/admin/data/`)

- [ ] Whitelist-only table browser (NOT full schema like AIASA)
- [ ] `GET /tables` — metadata + row counts
- [ ] `GET /tables/{name}/rows` — paginated, project-scoped
- [ ] `PUT /tables/{name}/rows/{id}` — editable tables only
- [ ] `POST /tables/{name}/rows` — editable tables only

**Editable tables:** `projects`, `agent_prompts`, `architecture_documents`, `architecture_decisions`  
**Read-only:** `audit_logs`, `grounding_records`, `gate_decisions`, `llm_usage_logs`, `pipeline_events`

---

## Sprint 2 — Governance page (4 tabs)

Replace `pages/GovernancePage.tsx` with AIASA-style shell.

### Shell

- [ ] Tab bar: Overview · Approvals · Lineage · Audit Log
- [ ] Project selector + refresh (all tabs)
- [ ] `lib/stores/governanceStore.ts`

### Overview tab

- [ ] Top stats bar: phase, LLM calls, tokens, avg grounding, gates, pending
- [ ] Phase roadmap table (A, 0–5) — collapsible sections
- [ ] Expand row → recent pipeline_events + audit entries for phase
- [ ] Grounding score distribution (simple bar)
- [ ] Show per-project retrieval strategy summary (not all projects use Graph RAG)

### Approvals tab

- [ ] Pending gates derived from project state
- [ ] History from `gate_decisions` (reviewer, notes, conditions)
- [ ] Expand row → full JSON + link to Project Workspace
- [ ] Gate names: `architecture_gate`, `register_gate`, `seed_gate`, `govern_gate`, `validate_gate`, `ship_gate`

### Lineage tab

- [ ] Visual flow: Intake → Architecture → ADRs → ontology.json → seed → Neo4j → Governed agents
- [ ] Node click → detail panel
- [ ] Include retrieval strategy node (which RAG variants this project uses)

### Audit Log tab

- [ ] Port AIASA filters: All | Errors | LLM | Gates
- [ ] Actor/agent dropdown
- [ ] Expandable `context` / `result` JSON
- [ ] Token columns (from llm_usage join)
- [ ] CSV export
- [ ] Immutable — no edit/delete

### Grounding drill-down

- [ ] Drawer/modal: cited nodes, query_path, response_summary, score
- [ ] Accessible from Overview expand + Audit Log row link

---

## Sprint 3 — Tools page (2 tabs)

### Governance Data tab

- [ ] Port AIASA `DBTablesTab` layout (scoped whitelist)
- [ ] Table list grouped: PROJECT | GOVERNANCE | SYSTEM
- [ ] Row count badges
- [ ] Warning banner: audit logs immutable
- [ ] Project filter scopes all queries
- [ ] JSONB cell expand
- [ ] Inline edit on editable tables
- [ ] Pagination (50) + column sort

### Agents tab

- [ ] Restyle existing framework agents to dark card layout
- [ ] Keep: Ontology Extractor, Compliance Detector, Grounding Query Generator/Builder, Compliance Checker, Phase Gate Validator
- [ ] Recent runs strip (last 3 audit entries per agent)

### Prompts

- [ ] Primary edit via Governance Data → `agent_prompts` table
- [ ] (Optional) Quick edit retained in agent cards

---

## Sprint 4 — RAG strategy & polish

### Per-project retrieval strategy (explicit)

Not every project uses Graph RAG. Capture in Phase A, store on project, surface in Dashboard.

- [ ] `projects.retrieval_strategy` JSONB schema:
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
- [ ] Phase A architecture doc captures strategy (link to Retrieval / Grounding Strategy doc)
- [ ] Project Workspace or Governance Data: view/edit strategy map
- [ ] Lineage tab shows strategy per agent
- [ ] SDK `GovernedBaseAgent` reads strategy before `_grounding_query()`
- [ ] Governance Overview: badge when project uses non-graph default
- [ ] Grounding tab/scores annotated: "N/A by design" for vector-only agents

### Polish

- [ ] Restyle Applications + Projects pages to dark theme
- [ ] Restyle ProjectWorkspace to match
- [ ] End-to-end test with `qlik-pbi-migration` project

---

## Explicitly out of scope

- [ ] ~~30-step AIASA agent pipeline dashboard~~
- [ ] ~~SSE live pipeline (optional later)~~
- [ ] ~~Territory/document reset utilities~~
- [ ] ~~Full 64-table PostgreSQL browser~~
- [ ] ~~Export package ZIP (deferred)~~
- [ ] ~~Neo4j data editing in Tools~~

---

## Success criteria

- [ ] Governance feels like AIASA: dark, 4 tabs, project selector, expandable audit
- [ ] Overview shows playbook phases A→5 (not OSA/OPA steps)
- [ ] Lineage traces intake → docs → ontology → graph → governed calls
- [ ] Tools → Governance Data: edit prompts/projects; read-only audit/grounding
- [ ] Token counts appear after governed agent runs
- [ ] Gate approvals in Approvals tab with reviewer notes
- [ ] Retrieval strategy visible and enforced — Graph RAG not assumed for every agent

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
│   └── tools/
│       ├── GovernanceDataTab.tsx
│       └── FrameworkAgentsTab.tsx
├── lib/stores/governanceStore.ts
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

---

*Update checkboxes and Progress summary as work completes. Say "Update progress: [item]" in Cursor to mark items done.*

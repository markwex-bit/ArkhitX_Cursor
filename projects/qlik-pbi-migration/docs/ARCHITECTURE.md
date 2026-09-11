# Qlik to Power BI Migration Assessor — Architecture

## How to view these diagrams

| Method | How |
|--------|-----|
| **Browser (recommended)** | Open [`architecture-overview.html`](./architecture-overview.html) in Chrome/Edge — Mermaid renders automatically |
| **Cursor Markdown preview** | Open this file → `Ctrl+Shift+V` (Windows) or `Cmd+Shift+V` (Mac) |
| **ASCII (always visible)** | Scroll to [ASCII Overview](#ascii-overview) — no preview needed |

---

## ASCII Overview

```
                     ┌────────────────────────┐        ┌────────────────────────┐
                     │ samples/powerbi/*.json  │        │ samples/qlik/*.json     │
                     │ (Scanner API shape)     │        │ (QRS API shape)        │
                     └───────────┬────────────┘        └───────────┬────────────┘
                                 ▼                                  ▼
                     ┌────────────────────────┐        ┌────────────────────────┐
                     │ Stage 0a: Eligibility   │        │ Stage 0b: Quality pass │
                     │ filter (deterministic)  │        │ (deterministic)        │
                     └───────────┬────────────┘        └───────────┬────────────┘
                                 ▼                                  ▼
                     ┌────────────────────────┐        ┌────────────────────────┐
                     │ Clean PBI pool          │        │ Scored Qlik inventory  │
                     └───────────┬────────────┘        └───────────┬────────────┘
                                 └───────────────┬──────────────────┘
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ Stage 1: Candidate gen   │
                                     │ (blocking, deterministic)│
                                     └────────────┬─────────────┘
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ Stage 2: Semantic match   │
                                     │ (LLM, narrowed set only)  │
                                     └────────────┬─────────────┘
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ Stage 3: Confidence tier  │
                                     │ + Migration advisor (LLM) │
                                     └────────────┬─────────────┘
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ Stage 4: Human sign-off   │
                                     │ gate (mandatory)          │
                                     └────────────┬─────────────┘
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ Stage 5: Migration backlog│
                                     └─────────────────────────┘
```

---

## Pipeline Flow (Mermaid)

```mermaid
flowchart TD
  PBIRaw["Power BI raw inventory\n(samples/powerbi/*.json)"] --> PBIElig["Stage 0a\nEligibility filter\n(deterministic)"]
  PBIElig --> PBIClean["Clean canonical\nPBI pool"]
  QlikRaw["Qlik raw inventory\n(samples/qlik/*.json)"] --> QlikQual["Stage 0b\nQuality pass\n(deterministic)"]
  QlikQual --> QlikClean["Scored Qlik\ninventory"]
  PBIClean --> Block["Stage 1\nCandidate generation\n(blocking, deterministic)"]
  QlikClean --> Block
  Block --> Semantic["Stage 2\nSemantic match\n(LLM — SemanticMatchAgent)"]
  Semantic --> Confidence["Stage 3\nConfidence tiering\n(deterministic) +\nMigration advisor (LLM)"]
  Confidence --> SignOff["Stage 4\nHuman sign-off gate\n(mandatory)"]
  SignOff --> Backlog["Stage 5\nMigration backlog\n(CSV export)"]
```

## Request Flow — Eligibility + Matching (Mermaid)

```mermaid
sequenceDiagram
    participant U as User (browser)
    participant UI as React frontend
    participant API as FastAPI backend
    participant Svc as Pipeline services
    participant LLM as Claude (Anthropic)
    participant DB as SQLite (sign-offs)

    U->>UI: Open app
    UI->>API: GET /api/eligibility, /api/quality/*, /api/dispositions
    API->>Svc: run_pipeline_cached()
    Svc->>Svc: eligibility.evaluate_eligibility() [deterministic]
    Svc->>Svc: quality.evaluate_qlik_quality() [deterministic]
    Svc->>Svc: matching.generate_candidates() [deterministic, blocking]
    Svc->>LLM: SemanticMatchAgent.process() [top N candidates only]
    LLM-->>Svc: semantic_score, matched/unmatched concepts
    Svc->>LLM: MigrationAdvisorAgent.process() [best candidate only]
    LLM-->>Svc: disposition, effort, rationale
    Svc-->>API: PipelineResult
    API-->>UI: JSON
    UI-->>U: Eligibility report, quality dashboard, match matrix

    U->>UI: Select candidate, submit sign-off
    UI->>API: POST /api/signoff
    API->>DB: INSERT signoffs row
    U->>UI: Open Backlog tab
    UI->>API: GET /api/backlog
    API->>DB: SELECT confirmed sign-offs
    API-->>UI: Backlog entries (only "confirmed")
```

## Component Responsibilities

| Layer | Component | Responsibility |
|-------|-----------|------------------|
| Data | `samples/qlik/qlik_apps_export.json` | Sample Qlik QRS-shaped export (3 apps) — see `DATA-SCHEMAS.md` |
| Data | `samples/powerbi/powerbi_scan_result.json` | Sample Power BI Scanner API-shaped export (20 apps, 6 workspaces) |
| Backend | `services/ingestion.py` | Parses raw JSON into normalized `QlikApp`/`PowerBIApp` models |
| Backend | `services/eligibility.py` | Stage 0a — deterministic PBI exclusion rules + near-duplicate clustering |
| Backend | `services/quality.py` | Stage 0b — Qlik completeness scoring + cross-platform parity matrix |
| Backend | `services/matching.py` | Stage 1 — candidate blocking + confidence tiering (pluggable interface) |
| Backend | `agents/semantic_match_agent.py` | Stage 2 — LLM business-intent comparison, graceful fallback if LLM unavailable |
| Backend | `agents/migration_advisor_agent.py` | Stage 3 — LLM disposition/effort/rationale, grounded in deterministic facts |
| Backend | `services/signoff.py` + `models/db_models.py` | Stage 4/5 — mandatory human sign-off gate (SQLite), migration backlog builder |
| Backend | `services/pipeline.py` | Orchestrates all stages; caches results (LLM calls are real, real cost) |
| Backend | `api/pipeline.py` | FastAPI routes for every stage |
| Frontend | `pages/HomePage.tsx` + `components/*` | Tabbed workbench: Eligibility Report, Quality Dashboard, Match Matrix + Detail pane + sign-off form, Migration Backlog |

## Phase 0 vs Future Phases (ArkhitX)

| Concern | Phase 0 (now) | Phase 2–3 (ArkhitX) |
|---------|---------------|---------------------|
| Candidate generation at scale | In-memory O(n×m) (fine for 3×20, fine for 400×~2,000 post-filtering) | Neo4j graph traversal — "PBI datasets within 2 hops via a shared data connection" — for the full 400×75,000 estate |
| Grounding storage | None (deterministic facts passed inline to LLM calls) | Neo4j knowledge graph — `MATCHES`, `SHARES_DATA_SOURCE`, `EXCLUDED_BECAUSE`, `SIGNED_OFF_BY` edges |
| Agent prompts | In code (`get_system_prompt()`) | `agent_prompts` table, loaded at runtime |
| Audit trail | None | Every LLM call logged to `audit_logs` via `GovernedBaseAgent` |
| Grounding score | None | Measured per response once agents extend `GovernedBaseAgent` |
| Sign-off persistence | SQLite (app's own DB) | Same table, plus `SIGNED_OFF_BY` edges in the knowledge graph for audit |

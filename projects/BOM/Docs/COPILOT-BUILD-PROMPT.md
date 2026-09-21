# Copilot Build Prompt — Costed BOM Comparison POC

Paste the **Master Prompt** below into VS Code Copilot Chat (prefer **Agent** mode).  
Workspace root must be **`projects/BOM/`** (this folder).

Before pasting, ensure Copilot can see:

- `Docs/TPC-SYNTHESIS-GENERATOR-TECHNICAL.md`
- `Docs/UX-WORKFLOW.md`
- `Docs/ARKHITX-REBUILD-PLAN.md`
- `Docs/_extracted_vba/modCostbookData.bas.bas` (business logic reference)
- `Tools/TPC Database - Synthesis Generator.xlsm` (for data export)

---

## Master Prompt (copy from here)

```markdown
# Task: Build Phase 0 POC — Costed BOM Comparison

You are building a web replacement for the Excel tool "TPC Database - Synthesis Generator".
Read ALL specification files in the Docs/ folder before writing code.

## Non-negotiable constraints

1. **Standalone project** under projects/BOM/ — do NOT require the parent ArkhitX_Cursor monorepo, Docker, PostgreSQL, or Neo4j for local run.
2. **SQLite default** — if DATABASE_URL is unset, use sqlite:///./bom_demo.db seeded from samples/*.parquet or CSV.
3. **No mock/fake TPC data** — load real rows exported from the xlsm. If DB empty, return empty results; never invent numbers.
4. **Deterministic engine** — port logic from Docs/_extracted_vba/modCostbookData.bas.bas into Python (services/costbook_engine.py). LLM never calculates TPC.
5. **Pluggable LLM** — support LLM_PROVIDER=none|anthropic|azure_openai|openai. When none or auth fails, Explain panel shows deterministic gap summary (top rows from engine), not hallucinated text.
6. **No personal API keys required** — app must demo fully with LLM_PROVIDER=none.
7. **UX** — implement Comparison Workspace from Docs/UX-WORKFLOW.md (NOT three Excel tabs). One WorkspacePage with carline rail, milestone timeline, comparison strip (up to 5), detail tabs, catalog drawer.
8. **Dark theme** — simple CSS variables (navy #1F2F69 headers, clean tables); no dependency on parent ArkhitX design-system unless copied locally.

## Stack

- Backend: FastAPI, SQLAlchemy, pandas, openpyxl (export), uvicorn
- Frontend: React 18, TypeScript, Vite, Tailwind, Recharts
- Ports: backend 8010, frontend 3010 (match projects.json when registered)

## Build order (complete each before next)

### Step 1 — Data export script
Create scripts/export_excel_tables.py:
- Read Tools/TPC Database - Synthesis Generator.xlsm with openpyxl/pandas
- Export tables to samples/: carlines_definition.parquet, stacked_costbooks.parquet (or demo subset stacked_costbooks_demo.parquet with ~5000 rows), costbook_records.parquet, exchange_rates.parquet, milestones.csv
- Document row counts in samples/README.md

### Step 2 — Backend engine
Port modCostbookData to backend/app/services/costbook_engine.py:
- CostbookIndex, FilteredCostbooks, GetCostbookRows, TotalTPC
- ParetoAgg, GapAgg, AlignedBomGap (minimum for demo)
- Currency conversion (ExchangeRates table)
- Milestone lifecycle order from Config

Add backend/app/services/data_loader.py to seed SQLite from samples/ on first run.

### Step 3 — API
- GET /api/costbooks/search?q=
- GET /api/carlines/{vehicle_code}/timeline
- GET /api/catalog?filters...
- POST /api/comparisons/calculate  { baseline, compares[], display_currency }
  Returns: kpis, charts data, gap_drivers, systems, parts, full_bom rows
- POST /api/explain  { comparison_result, question }
  Calls LLM adapter with engine output as context; fallback template if LLM_PROVIDER=none

### Step 4 — LLM adapter
backend/app/services/llm_provider.py:
- get_llm_client() based on LLM_PROVIDER env
- azure_openai: use openai SDK + AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_DEPLOYMENT (api key optional if corp uses other auth later)
- none: return None; explain endpoint uses template summarizing top 5 gap rows

### Step 5 — Frontend Workspace
Implement Docs/UX-WORKFLOW.md:
- WorkspacePage, CarlineRail, MilestoneTimeline, ComparisonStrip
- DetailTabs: Gap Drivers (default when 2+ costbooks), Systems, Parts, Full BOM
- CatalogDrawer (⌘K or button)
- ExplainPanel (collapsible bottom)
- Fifth split colors from UX doc

### Step 6 — Run scripts
scripts/run_local.ps1 (Windows):
- Create .venv if missing, pip install -r backend/requirements.txt
- Seed SQLite if bom_demo.db missing
- Start uvicorn on 8010 and npm run dev on 3010 in parallel (or instruct two terminals)

scripts/run_local.sh for Mac/Linux optional.

### Step 7 — README
Root README.md with:
- Quick start (no Docker)
- LLM_PROVIDER options for work vs home
- How to refresh samples from xlsm

## Parity checks
Compare POST /api/comparisons/calculate output against Excel for one known vehicle with 2 milestones — totals must match within 0.01.

## Out of scope for POC
- ArkhitX governance SDK, Neo4j, Docker (add docker-compose.yml stub only)
- Full 4-sheet Excel report export (Phase 0b)
- GitHub Actions CI

Start with Step 1. Show me the file tree when Step 1 is done before proceeding.
```

---

## Follow-up prompts (use after Master Prompt)

**After Step 2:**
> Implement POST /api/comparisons/calculate using costbook_engine. Include gap_drivers with two-sided sort (increases then decreases).

**After Step 5:**
> Wire ExplainPanel to POST /api/explain. When LLM_PROVIDER=none, show structured bullet summary from gap_drivers.

**Parity:**
> Add a test comparing TotalTPC for vehicle "R7P JT Big Horn ICE T4 EVO Hurricane NA TNAP (Toledo)" milestone CM against values from _workbook_analysis.json sample rows.

---

## Tips for Copilot at work

1. **One step at a time** — Copilot loses context if you ask for everything at once.
2. **Reference files by path** — `@Docs/UX-WORKFLOW.md` in chat if your Copilot supports file context.
3. **Verify numbers** — open the `.xlsm` and compare one costbook total after engine is built.
4. **LLM_PROVIDER=none** — confirm demo works before chasing corporate Azure OpenAI.
5. **Do not commit `.env`** — only `.env.example`.

---

## If Copilot struggles

Fall back to **Path A**: build on personal laptop with Cursor using the same Docs, push to GitHub, clone on work PC.

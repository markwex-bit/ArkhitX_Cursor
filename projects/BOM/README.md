# Costed BOM Comparison — Phase 0 POC

Web replacement for **TPC Database - Synthesis Generator** (Excel/VBA).

## Quick start (no Docker)

**Windows (work or home PC):**

```powershell
cd projects/BOM
.\scripts\run_local.ps1
```

Open **http://localhost:3010**

**Manual (two terminals):**

```powershell
# Terminal 1 — backend
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy ..\.env.example ..\.env
cd ..
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload --app-dir backend

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

## Prerequisites

- Python 3.11+
- Node.js 20+
- No Docker or PostgreSQL required for demo

## Data

Samples exported from `Tools/TPC Database - Synthesis Generator.xlsm`:

```powershell
python scripts/export_excel_tables.py
```

| File | Purpose |
|------|---------|
| `samples/stacked_costbooks_demo.parquet` | 3 demo vehicles (~4k rows) — default |
| `samples/stacked_costbooks.parquet` | Full dataset (~96k rows) — set `DATA_MODE=full` |

## Environment (`.env`)

| Variable | Demo default | Notes |
|----------|--------------|-------|
| `DATA_MODE` | `demo` | `full` for entire stacked costbooks |
| `LLM_PROVIDER` | `none` | **No API key needed** — template Explain panel |
| `LLM_PROVIDER` | `anthropic` | Personal machine + `ANTHROPIC_API_KEY` |
| `LLM_PROVIDER` | `azure_openai` | Work PC corporate endpoint |

Copy `.env.example` → `.env`. Never commit `.env`.

## Work PC demo

1. Clone or copy this folder (include `samples/` and `Tools/` for re-export).
2. `LLM_PROVIDER=none` in `.env` — full comparison UI works without keys.
3. See `Docs/WORK-PC-DEMO-GUIDE.md`.

## API

- `GET /api/meta` — levels, split values, currencies
- `GET /api/catalog` — Data Explorer rows + source URLs
- `GET /api/costbooks/search?q=`
- `GET /api/carlines/timeline?vehicle_code=`
- `POST /api/comparisons/calculate`
- `POST /api/explain`
- `POST /api/reports/costbook` — 4-sheet Excel export
- `POST /api/reports/gap` — 4-sheet gap Excel export

Docs: http://localhost:8010/docs

## Excel parity

See **`Docs/PARITY-STATUS.md`** for feature-by-feature comparison with the `.xlsm`.  
Use **`DATA_MODE=full`** for the complete stacked costbook dataset.

## Specs

- `Docs/UX-WORKFLOW.md` — Comparison Workspace UX
- `Docs/TPC-SYNTHESIS-GENERATOR-TECHNICAL.md` — VBA logic reference
- `Docs/COPILOT-BUILD-PROMPT.md` — build instructions for VS Code Copilot

## Cloud later

Add `docker/docker-compose.yml` when deploying to AWS/Azure with PostgreSQL. Local demo unchanged.

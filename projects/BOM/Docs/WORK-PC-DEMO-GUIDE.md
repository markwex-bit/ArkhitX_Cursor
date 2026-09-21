# Work PC Demo Guide

How to get the Costed BOM Comparison app running on a **work laptop** (VS Code + Copilot/CoCo, **no Docker**, **no personal API keys**).

---

## Recommended path (pick one)

| Path | When to use | Reliability |
|------|-------------|-------------|
| **A. GitHub clone** | App already built on personal machine | Best for demo |
| **B. Copy folder + Copilot build** | App not built yet; build at work with Copilot | Good if you follow the prompt |
| **C. USB / OneDrive copy** | No GitHub from work | Same as A or B depending on whether code exists |

**Strong recommendation:** Build the POC on your **personal laptop (Cursor)** first, push to **GitHub**, clone on work PC, run `scripts/run_local.ps1`. Copilot at work is then optional for fixes — not the primary builder.

If you must build entirely at work, use **Path B** with [COPILOT-BUILD-PROMPT.md](./COPILOT-BUILD-PROMPT.md).

---

## What to copy to the work PC

Copy the whole **`projects/BOM/`** folder (or clone the repo):

```text
projects/BOM/
├── Docs/              ← REQUIRED (specs + Copilot prompt)
├── Tools/             ← REQUIRED (xlsm source + sample xlsx)
├── samples/           ← after export script runs (Parquet/CSV)
├── backend/           ← after app is built
├── frontend/          ← after app is built
├── scripts/
└── README.md
```

### Required on work PC

| Item | Size | Notes |
|------|------|-------|
| `Docs/` | ~400 KB | All markdown + `_extracted_vba/` + `_workbook_analysis.json` |
| `Tools/TPC Database - Synthesis Generator.xlsm` | ~15 MB | Source of truth for data export |
| `Tools/CC21 BEV 300 L2_Luc.xlsx` | ~570 KB | Optional sample |

### Do NOT copy

- Personal `.env` or `ANTHROPIC_API_KEY`
- Full `ArkhitX_Cursor` workspace (not needed for demo-only)
- `node_modules/`, `.venv/`, `__pycache__/`

### GitHub note

The 15 MB `.xlsm` may exceed GitHub file limits on free tier — options:

1. **Git LFS** for `Tools/*.xlsm`
2. **Export `samples/*.parquet`** on personal PC and commit those instead (smaller repo)
3. **OneDrive/USB** for `Tools/` only; repo has code + docs + samples

---

## Work PC prerequisites (no Docker)

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 20+ |
| VS Code | + Copilot or CoCo extension |
| Git | optional but recommended |

---

## Runtime on work PC (after app exists)

```powershell
cd projects\BOM
copy .env.example .env
# Set LLM_PROVIDER=none  (demo without any API key)
# OR set LLM_PROVIDER=azure_openai + corp endpoint if IT provides one

.\scripts\run_local.ps1
# Open http://localhost:3010
```

- **Database:** SQLite (auto-created from `samples/`) — no PostgreSQL install
- **LLM:** `none` = deterministic gap summary in Explain panel; no personal keys
- **Comparison UI:** works fully without LLM

---

## Path B: Build at work with Copilot

1. Copy `projects/BOM/` to work PC (or clone repo).
2. Open **`projects/BOM`** as the VS Code workspace root (not whole ArkhitX_Cursor).
3. Open [COPILOT-BUILD-PROMPT.md](./COPILOT-BUILD-PROMPT.md).
4. Paste the **Master Prompt** block into Copilot Chat (Agent mode if available).
5. Tell Copilot: *"Read all files in Docs/ first, then implement Phase 0 POC per the prompt."*
6. Work in slices: backend engine → API → frontend shell → Explain panel.

Keep the Excel tool open for side-by-side numeric parity checks.

---

## Path A: Build on personal laptop, demo at work

1. On personal laptop (Cursor): build POC per `ARKHITX-REBUILD-PLAN.md` + `UX-WORKFLOW.md`.
2. Export xlsm tables to `samples/` (include a **demo subset** for fast clone).
3. Push to GitHub (private repo is fine).
4. On work PC: `git clone` → `run_local.ps1` → demo in browser.

No Copilot build required at work; Copilot useful only for last-minute UI tweaks.

---

## Cloud later (AWS/Azure)

Same repo; add `docker/docker-compose.yml` when ready. Work PC demo path unchanged — Docker is for deployment only.

---

## Related docs

- [COPILOT-BUILD-PROMPT.md](./COPILOT-BUILD-PROMPT.md) — paste into VS Code Copilot at work
- [UX-WORKFLOW.md](./UX-WORKFLOW.md) — UI spec
- [TPC-SYNTHESIS-GENERATOR-TECHNICAL.md](./TPC-SYNTHESIS-GENERATOR-TECHNICAL.md) — port `modCostbookData`
- [ARKHITX-REBUILD-PLAN.md](./ARKHITX-REBUILD-PLAN.md) — phases and stack

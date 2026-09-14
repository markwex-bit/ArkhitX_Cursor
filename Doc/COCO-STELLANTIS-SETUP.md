# Snowflake CoCo — Stellantis Setup (ArkhitX + Qlik-PBI Migration)

Use this on a **Stellantis work machine** (VS Code + Snowflake CoCo) to clone, run, and
develop the same codebase you use at home — **without changing committed repo files**.

---

## How to use this with CoCo

1. Clone the repo and open the folder in VS Code.
2. Open **CoCo Chat**.
3. Copy everything inside **PROMPT START / PROMPT END** below.
4. Paste into CoCo and run it step-by-step.
5. Approve shell commands before they run.

**Also tell CoCo:** “Read `Doc/COCO-STELLANTIS-SETUP.md` at the start of every session.”

---

## Clone-safe rules (CoCo must follow)

These keep the repo identical between Stellantis and home — **never break these**:

| Do | Don't |
|----|-------|
| Create/edit **local** `.env` from `.env.example` | Commit `.env`, certs, or API keys |
| Use `DATA_SOURCE=sample` until IT approves live APIs | Change `docker-compose.yml`, ports in repo, or `package.json` for corp policy |
| Put Qlik certs in `projects/qlik-pbi-migration/certs/` (gitignored) | Hardcode Stellantis URLs, proxies, or hostnames in source code |
| Commit **code/docs** via git; pull before you start | Add Stellantis-specific files that other clones would need |

**Local-only (never commit):** `.env`, `*.env` (except `.env.example`), `certs/`, `*.db`,
`node_modules/`, `__pycache__/`, `.venv/`

**Sync workflow:** `git pull` → work → commit code → `git push`. Secrets stay on each machine.

---

## PROMPT START — copy from here

You are helping me run **ArkhitX** and **Qlik to Power BI Migration Assessor** on a
**Stellantis corporate Windows machine** using VS Code and Snowflake CoCo.

Work step-by-step. Ask before destructive commands. **Do not modify committed repo
files** for Stellantis-specific config — use local `.env` and gitignored folders only.

### Context

- **Repo:** `https://github.com/markwex-bit/ArkhitX_Cursor.git`
- **What is in git:** `framework/` (ArkhitX), `infrastructure/`, `projects/qlik-pbi-migration/`, `scripts/`, docs
- **Key docs:** `WORKSPACE.md`, `METHODOLOGY.md`, `.cursorrules`, `projects/qlik-pbi-migration/docs/USER-WORKFLOW.md`
- **Default mode:** `DATA_SOURCE=sample` — reads `samples/*.json`, no Qlik/PBI/Anthropic required for UI + deterministic pipeline

### Ports (from `projects.json`)

| Component | URL |
|-----------|-----|
| Qlik-PBI frontend | http://localhost:3008 |
| Qlik-PBI backend | http://localhost:8008 |
| Qlik-PBI Postgres | localhost:5441 |
| ArkhitX API | http://localhost:8080 |
| ArkhitX Dashboard | http://localhost:8090 |
| Neo4j Browser | http://localhost:7474 |

---

### Step 1 — Clone and verify

```powershell
cd C:\Users\<me>\Projects
git clone https://github.com/markwex-bit/ArkhitX_Cursor.git
cd ArkhitX_Cursor
git pull
git status
git log -1 --oneline
```

Confirm these exist:

```
framework/
infrastructure/
projects/qlik-pbi-migration/
projects/qlik-pbi-migration/samples/
scripts/new_project.py
projects.json
```

---

### Step 2 — Prerequisites (report pass/fail)

| Tool | Command | Notes |
|------|---------|-------|
| Git | `git --version` | Required |
| Docker | `docker --version` && `docker info` | Preferred; may be blocked at Stellantis |
| Docker Compose | `docker compose version` | v2 |
| Python | `python --version` | 3.11+ (fallback if no Docker) |
| Node.js | `node --version` | 18+ (fallback if no Docker) |

If Docker is **blocked**, skip to **Step 4B (native run)** — sample mode still works.

Corporate blockers to flag explicitly:

- Docker Desktop / WSL2 disabled
- Outbound HTTPS to `api.anthropic.com`, `registry.npmjs.org`, `pypi.org`, Docker Hub
- Localhost port binding restricted

---

### Step 3 — Local environment (no repo changes)

**Qlik-PBI project** — create local env only:

```powershell
cd projects\qlik-pbi-migration
copy .env.example .env
```

Edit `projects/qlik-pbi-migration/.env`:

```
DATA_SOURCE=sample
```

Leave `ANTHROPIC_API_KEY` blank for now unless IT provides one. Leave all `ARKHITX_*`,
`QLIK_*`, and `PBI_*` blank unless Phase 3 / live extraction is approved.

Verify not tracked:

```powershell
git status --short .env
```

**Optional — ArkhitX governance (Phase 3 only):**

```powershell
cd ..\..\infrastructure
copy ..\.env.example .env
```

Set `ANTHROPIC_API_KEY` in `infrastructure/.env` only if LLM agents on the governance
dashboard are needed.

---

### Step 4A — Run with Docker (preferred)

**Start ArkhitX infrastructure (optional — only for governance dashboard):**

```powershell
cd infrastructure
docker compose up -d
docker compose ps
```

Wait for healthy, then check:

```powershell
curl http://localhost:8080/docs
curl http://localhost:8090
```

**Start Qlik-PBI app** (must run from project folder, not `infrastructure/`):

```powershell
cd ..\projects\qlik-pbi-migration
docker compose up -d --build
docker compose ps
```

Health check:

```powershell
curl http://localhost:8008/health
curl http://localhost:8008/api/intake
curl http://localhost:3008
```

Open **http://localhost:3008** — Intake tab should show 3 Qlik apps, 20 PBI datasets (sample).

If frontend shows errors during startup, wait for backend healthcheck (~30s) and refresh.

---

### Step 4B — Run without Docker (Stellantis fallback)

Use when Docker is blocked. Sample mode only; sign-offs use local SQLite.

**Backend:**

```powershell
cd projects\qlik-pbi-migration\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -e ..\..\..\framework\sdk
$env:DATA_SOURCE="sample"
$env:CORS_ORIGINS="http://localhost:3008"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8008
```

**Frontend** (second terminal):

```powershell
cd projects\qlik-pbi-migration\frontend
npm install
npm run dev
```

Vite dev server proxies `/api` to the backend. Open the URL Vite prints (port 3008).

---

### Step 5 — What works without corporate approvals

With `DATA_SOURCE=sample`, **no external APIs**:

| Feature | Works? |
|---------|--------|
| Intake tab + metadata coverage | Yes |
| Power BI eligibility | Yes |
| Qlik qualification | Yes |
| Overlap / dispositions (deterministic) | Yes |
| Backlog + sign-off | Yes |
| LLM refresh (`POST /dispositions/refresh`) | Needs `ANTHROPIC_API_KEY` |
| Live Qlik/PBI extraction | Needs certs + service principal (see `docs/LIVE-EXTRACTION-SETUP.md`) |
| ArkhitX governance dashboard | Needs `infrastructure/` + `ARKHITX_*` in `.env` |

---

### Step 6 — Live data at Stellantis (when IT approves)

**Do not enable live mode until approved.** Two safe paths:

**Path A — JSON handoff (recommended):**

1. Qlik/PBI admins export metadata per `projects/qlik-pbi-migration/docs/DATA-REQUEST-CHECKLIST.md`
2. Place files at:
   - `projects/qlik-pbi-migration/samples/qlik/qlik_apps_export.json`
   - `projects/qlik-pbi-migration/samples/powerbi/powerbi_scan_result.json`
3. Keep `DATA_SOURCE=sample` — no live API calls from your laptop

**Path B — Live extraction:**

1. Follow `projects/qlik-pbi-migration/docs/LIVE-EXTRACTION-SETUP.md`
2. Certs → `projects/qlik-pbi-migration/certs/` (gitignored)
3. Set `DATA_SOURCE=live` in local `.env` only
4. Often requires VPN + jump box with Qlik Engine `:4747` access

---

### Step 7 — Phase 3 governance (optional)

Only when `infrastructure/` is running and IT allows connection to ArkhitX Postgres/Neo4j:

```powershell
cd projects\qlik-pbi-migration
python scripts\01_register_project.py
```

Copy printed `ARKHITX_PROJECT_ID` and DB URLs into **local** `.env` (project root).
Restart Qlik-PBI containers. Governance events appear on http://localhost:8090.

---

### Step 8 — Final readiness report

| Check | Status | Notes |
|-------|--------|-------|
| Repo cloned from ArkhitX_Cursor | | |
| `.env` created locally, not committed | | |
| `DATA_SOURCE=sample` | | |
| Backend `/health` → 200 | | |
| Backend `/api/intake` → 200 | | |
| Frontend loads at :3008 | | |
| Intake tab shows sample counts | | |
| Ready to develop | | |

If anything failed, give the exact fix. **Do not change repo files to work around corp policy.**

---

### Rules for all future CoCo sessions

1. Read `METHODOLOGY.md`, `.cursorrules`, and this file before coding.
2. **ArkhitX governs. The solution solves.** Framework in `framework/`; app in `projects/qlik-pbi-migration/`.
3. **No mock data or silent fallbacks** — raise errors if API/DB missing.
4. **Stellantis config stays local** — `.env` and `certs/` only.
5. Default to **sample mode** unless user explicitly enables live/governance.
6. When user pulls from git, never overwrite their local `.env`.

## PROMPT END

---

## Quick reference

```powershell
# Pull latest (do this first every session)
git pull

# Qlik-PBI (Docker)
cd projects\qlik-pbi-migration
docker compose up -d --build
docker compose logs -f backend

# ArkhitX infrastructure (optional)
cd infrastructure
docker compose up -d

# Stop
cd projects\qlik-pbi-migration && docker compose down
```

**Dashboard login (ArkhitX):** `consultant@arkhitx.com` / `consultant123`

---

## Troubleshooting CoCo should know

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Backend error (404)` on Intake | Backend not restarted after pull | `docker compose restart backend` or rebuild |
| `Failed to load` / connection refused | Backend still starting | Wait for healthy; retry |
| `ANTHROPIC_API_KEY` error on load | Frontend hit LLM path | Use sample mode; avoid Refresh dispositions without key |
| Docker pull blocked | Registry firewall | Request mirror or use Step 4B native run |
| `arkhitx-network` error | Infrastructure not running | Start `infrastructure/` first, or comment external network in compose **only if user approves a local-only hack** — prefer starting infra |

---

## Related docs

| Doc | Purpose |
|-----|---------|
| `WORKSPACE.md` | Repo layout and quick start |
| `Doc/COPILOT-WORKSPACE-SETUP.md` | Generic Copilot setup (older; projects are now in git) |
| `projects/qlik-pbi-migration/docs/USER-WORKFLOW.md` | App workflow |
| `projects/qlik-pbi-migration/docs/LIVE-EXTRACTION-SETUP.md` | Live Qlik/PBI (IT approval) |
| `projects/qlik-pbi-migration/docs/DATA-REQUEST-CHECKLIST.md` | Admin export request |

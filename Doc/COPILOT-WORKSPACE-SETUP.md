# GitHub Copilot — ArkhitX Workspace Setup Prompt

Use this document on a **new machine** (VS Code + GitHub Copilot) to clone the
ArkhitX framework, verify prerequisites, start infrastructure, and confirm you
are ready to scaffold a new project.

---

## How to use this with Copilot

1. Clone this repo and open the folder in VS Code.
2. Open **Copilot Chat** (`Ctrl+Shift+I` or the chat panel).
3. Copy everything inside the **PROMPT START / PROMPT END** block below.
4. Paste it into Copilot Chat and run it.
5. Work through each step Copilot proposes. Approve shell commands before they run.

---

## PROMPT START — copy from here

You are helping me set up the **ArkhitX governance framework** on a new Windows
work machine using VS Code and GitHub Copilot. Work step-by-step. Ask before
running destructive commands. Show command output and explain failures clearly.

### Context

- **Repo:** `https://github.com/markwex-bit/arkhitx-framework.git`
- **What this repo contains:** ArkhitX framework only (`framework/`, `infrastructure/`, `scripts/`, docs). The `projects/` folder is gitignored and will be created locally.
- **Architecture:** PostgreSQL + Neo4j + ArkhitX API + ArkhitX Dashboard run in Docker. Individual app projects are scaffolded under `projects/` and are not in git.
- **Key docs:** `WORKSPACE.md`, `README.md`, `METHODOLOGY.md`, `framework/docs/`

### Your goals

1. Clone the repo (or confirm it is already cloned).
2. Verify I have everything required to run the framework.
3. Start shared infrastructure and confirm services are healthy.
4. Confirm I am ready to run `python scripts/new_project.py` to create a new project.

---

### Step 1 — Clone the repository

If the workspace is not already open, clone it:

```powershell
cd C:\Users\<me>\Projects
git clone https://github.com/markwex-bit/arkhitx-framework.git ArkhitX_Cursor
cd ArkhitX_Cursor
```

Verify clone:

```powershell
git remote -v
git status
git log -1 --oneline
```

Expected: remote `origin` points to `markwex-bit/arkhitx-framework`, branch `main`,
clean working tree (except local untracked `projects/` if it exists).

---

### Step 2 — Verify prerequisites

Check each tool. Report pass/fail for every item.

| Requirement | Check command | Minimum |
|-------------|---------------|---------|
| Git | `git --version` | 2.x |
| Docker | `docker --version` | Docker Desktop or Engine |
| Docker Compose | `docker compose version` | v2 |
| Python | `python --version` | 3.11+ |
| Node.js (optional for local frontend dev) | `node --version` | 18+ |
| npm (optional) | `npm --version` | 9+ |

Also verify:

```powershell
docker info
```

Docker must be **running** (not just installed). If Docker is blocked by corporate
policy, stop and tell me — PostgreSQL/Neo4j cannot run without it.

Confirm these folders exist in the repo:

```
framework/
infrastructure/
scripts/new_project.py
projects.json
WORKSPACE.md
README.md
.gitignore          ← must contain /projects/
```

Verify `projects/` is ignored:

```powershell
git check-ignore -v projects 2>$null; if (-not $?) { Write-Host "WARNING: projects/ is NOT ignored" }
```

---

### Step 3 — Configure environment

**Do not commit secrets.** Create local env files only.

1. Copy root template (for reference / local scripts):

```powershell
copy .env.example .env
```

2. Create infrastructure env (required for ArkhitX backend LLM calls):

```powershell
copy .env.example infrastructure\.env
```

3. Edit `infrastructure\.env` and set a real value:

```
ANTHROPIC_API_KEY=sk-ant-...
```

If Anthropic is blocked at work, stop and discuss alternatives (Azure OpenAI, etc.)
before proceeding — the framework agents require an LLM API key.

Confirm `.env` and `infrastructure/.env` are **not** tracked by git:

```powershell
git status --short .env infrastructure/.env
```

Expected: no staged files (they should be gitignored).

---

### Step 4 — Start ArkhitX infrastructure

```powershell
cd infrastructure
docker compose up -d
docker compose ps
```

Wait until all services are healthy:

| Service | URL | Expected |
|---------|-----|----------|
| PostgreSQL | localhost:5432 | container healthy |
| Neo4j Browser | http://localhost:7474 | login `neo4j` / `password` |
| ArkhitX API | http://localhost:8080/docs | OpenAPI page loads |
| ArkhitX Dashboard | http://localhost:8090 | UI loads |

Health checks:

```powershell
curl http://localhost:8080/docs
curl http://localhost:8090
```

If containers fail, run `docker compose logs` for the failing service and diagnose.

Dashboard login (default seed):

- Email: `consultant@arkhitx.com`
- Password: `consultant123`

---

### Step 5 — Confirm ready for a new project

Run the scaffold script in **dry-run / help** mode first:

```powershell
cd ..   # back to repo root
python scripts/new_project.py --help
```

If help works, I am ready to create a project:

```powershell
python scripts/new_project.py my-new-app --name "My New App"
```

This should create `projects/my-new-app/` with backend, frontend, docker-compose,
phase docs, and auto-assigned ports in `projects.json`.

After scaffolding, start the new project (Phase 0 — standalone):

```powershell
cd projects/my-new-app
docker compose up --build
```

Open the frontend URL printed in `projects.json` for that slug.

---

### Step 6 — Final readiness report

Produce a checklist table:

| Check | Status | Notes |
|-------|--------|-------|
| Repo cloned | | |
| Git remote correct | | |
| Docker running | | |
| Python available | | |
| `infrastructure/.env` has API key | | |
| Infrastructure containers healthy | | |
| API docs reachable (:8080) | | |
| Dashboard reachable (:8090) | | |
| `new_project.py --help` works | | |
| Ready to scaffold | | |

If anything failed, give the exact fix before marking ready.

---

### Rules for this workspace (follow in all future sessions)

1. **ArkhitX governs. The solution solves.** Framework code lives in `framework/`; app code lives in `projects/`.
2. **Never modify `framework/` for project-specific logic.**
3. **Never commit `projects/` or `.env` files** — they stay local.
4. **No mock data or LLM fallbacks** — if the API or DB fails, raise the error.
5. **PostgreSQL = governance data. Neo4j = domain/knowledge graph data.** Never mix.
6. Use `python scripts/new_project.py <slug>` to create projects — never scaffold manually.
7. Phase docs in `framework/docs/` and each project's `docs/` define the retrofit workflow (Phase 0 → 3).

When I ask you to build or extend a project, read `WORKSPACE.md` and the relevant
phase doc before writing code.

## PROMPT END

---

## After setup — useful commands

```powershell
# Start infrastructure (from repo root)
cd infrastructure && docker compose up -d

# Stop infrastructure
cd infrastructure && docker compose down

# Create a new project
python scripts/new_project.py <slug> --name "Human Name"

# Run a project (Phase 0)
cd projects/<slug> && docker compose up --build
```

---

## Repo structure reminder

```
ArkhitX_Cursor/
├── Doc/                     ← You are here
├── framework/               ← ArkhitX governance (in git)
├── infrastructure/          ← Shared Docker services (in git)
├── scripts/new_project.py   ← Project scaffolder (in git)
├── projects.json            ← Port registry (in git)
└── projects/                ← App projects (local only, gitignored)
```

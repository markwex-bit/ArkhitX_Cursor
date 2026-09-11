# Phase 0 — Build

## What Was Built

A metadata-driven **triage and prioritization tool** — not an autonomous decision tool — for
assessing which Power BI apps could replace Qlik Sense apps being sunset. Built and proven
against realistic sample data (3 Qlik apps, 20 Power BI apps across 6 workspaces), staged so
each platform is rationalized independently before any cross-platform comparison happens.

### Pipeline stages (implemented in `backend/app/services/` and `backend/app/agents/`)

| Stage | Module | Deterministic or LLM? |
|---|---|---|
| 0a. Power BI eligibility filtering | `services/eligibility.py` | Deterministic |
| 0b. Qlik quality pass + parity matrix | `services/quality.py` | Deterministic |
| 1. Candidate generation (blocking) + confidence tiering | `services/matching.py` | Deterministic |
| 2. Semantic matching | `agents/semantic_match_agent.py` | LLM (Claude, via `BaseAgent`) |
| 3. Migration advisory | `agents/migration_advisor_agent.py` | LLM (Claude, via `BaseAgent`) |
| 4. Human sign-off gate | `services/signoff.py` (SQLite via SQLAlchemy) | Human — mandatory |
| 5. Migration backlog | `api/pipeline.py` (`/api/backlog`, `/api/backlog/export.csv`) | Derived from confirmed sign-offs only |

Orchestration lives in `services/pipeline.py`, which runs all stages in order and caches the
result for the process lifetime (LLM calls are real API calls — the cache avoids re-triggering
them on every page load; `POST /api/dispositions/refresh` forces a re-run).

### Verified results against the sample data (actual computed output, not hand-picked)

Running the pipeline against the 20 sample Power BI apps:

- **10 eligible, 10 excluded** before any Qlik comparison happens.
- Exclusion breakdown: `test_or_sandbox_name: 5`, `stale: 4`, `duplicate: 3`,
  `personal_workspace: 3`, `broken_lineage: 2`, `orphaned_dataset: 1` (an app can have more than
  one reason, so these don't sum to 10).
- The 3 Qlik apps produced exactly the 3 outcome types they were designed to demonstrate:
  - **Sales Performance Dashboard** → High-confidence candidate (`Regional Sales Performance`,
    shared `SALESDW_PROD` connection, semantic score ~72-78/100) → **Extend** (real gaps: sales
    rep leaderboard, product category dimension not confirmed on the Power BI side).
  - **Regional Ops Tracker** → High-confidence candidate (`Regional Ops KPI Tracker`, shared
    `OPS_FILESHARE` connection) → **Extend**, with the advisor explicitly citing the Qlik app's
    own 312-day staleness as a factor.
  - **Customer Loyalty Analytics** → no viable candidates (all Low confidence, semantic scores
    5-15/100) → **Rebuild** — a genuine case where metadata correctly finds nothing, rather than
    forcing a weak match.

## Key Design Decisions

1. **Eligibility and quality gating happen before matching, per platform, independently.**
   Power BI's own portfolio problem (test apps, personal workspaces, duplicates, orphaned
   datasets) is resolved with zero Qlik involvement — see `services/eligibility.py`. This is
   what keeps a real 75,000-app estate from ever reaching an LLM.

2. **Qlik QRS cannot expose table-level lineage — the tool doesn't pretend otherwise.**
   The primary deterministic cross-platform signal is a *data-connection name* match between
   Qlik's `dataConnections` and Power BI's `datasourceUsages`, explicitly documented in
   `docs/DATA-SCHEMAS.md` as a best-effort proxy, not a guaranteed mapping. Where this signal
   isn't available, confidence tiering degrades honestly to Medium/Low rather than hiding the
   gap.

3. **The LLM is only invoked after deterministic blocking narrows the field**, and only ever
   sees structured facts it didn't invent (names, measures, sheet titles, which signals were
   even available) — never raw dumps, never live data. See the "signals_missing" field on every
   `MatchCandidate`.

4. **Every LLM agent degrades gracefully and honestly, never silently.** If
   `ANTHROPIC_API_KEY` is missing or a call fails, `SemanticMatchAgent` and
   `MigrationAdvisorAgent` return `llm_used: false` with a clearly-labeled fallback rationale
   that explicitly says it is not an AI judgment — see the `except` blocks in both agent files.
   This is a Phase-0 standalone-mode concern, not a violation of the "no mock data" rule: the
   fallback is never presented as if the LLM produced it.

5. **No automatic sunset action anywhere in the codebase.** `services/signoff.py` is the only
   path to the migration backlog, and it always requires an explicit reviewer decision
   (`confirmed` / `overridden` / `needs_more_info`). Only `confirmed` entries are exportable.

6. **Candidate generation is a pluggable, swappable interface today.** `matching.generate_candidates()`
   does an in-memory O(n×m) comparison, which is fine at 3×20 (and even fine at 400×~2,000 after
   eligibility filtering). At the full 400×75,000 estate, this function's *signature* stays the
   same but its *implementation* becomes a Neo4j graph traversal — see "Knowledge graph" note in
   the project plan and in `ARCHITECTURE.md`.

## How to Run (Standalone)

```bash
cd projects/qlik-pbi-migration
# Add a real ANTHROPIC_API_KEY to .env first
docker-compose up --build
```

Open http://localhost:3008. First load runs the full pipeline including real Claude API calls
for the top candidates per Qlik app — allow up to ~60-90 seconds.

### Docker Compose deployment bugs found and fixed (post-build verification)

Phase 0 was originally verified only with local `uvicorn` + `npm run dev` (not Docker). When
`docker-compose up --build` was run for the first time, it failed with a generic frontend error
("Failed to load pipeline data. Is the backend running? Check ANTHROPIC_API_KEY in .env.") that
was misleading — the API key was never the problem. Four real, distinct bugs were found and
fixed by reading actual container logs rather than guessing:

1. **`backend/requirements.txt`** — `psycopg2-binary` was commented out, but `docker-compose.yml`
   points `DATABASE_URL` at Postgres (local runs default to SQLite instead, which is why this
   never surfaced before). Fixed by uncommenting it.
2. **`docker-compose.yml`** — the backend container never mounted `samples/`, so `ingestion.py`
   (which resolves its sample-data path relative to its own file location) couldn't find the
   sample JSON inside the container. Fixed by adding a `./samples:/samples` volume mount.
3. **`docker-compose.yml`** — `VITE_API_URL: ""` was falsy, so Vite's dev-server proxy fell back
   to `http://localhost:8008` inside the *frontend* container, which doesn't resolve to anything
   there. Fixed by setting it to `http://backend:8000` (Docker Compose's internal service DNS).
4. **`frontend/vite.config.ts`** — Vite's file watcher never saw edits made from the Windows host
   through the bind mount, so hot-reload silently never fired for *any* frontend change while
   running under `docker-compose up`. Fixed by enabling `server.watch.usePolling: true`.

**Takeaway:** Phase 0 "works locally" is not the same as "works via the documented `docker-compose up`
path" — the second one needs its own pass. All four fixes are now in place and verified against a
live run (real Anthropic API calls succeeding through the Dockerized backend + frontend).

### Metadata reference added to the UI (post-build addition)

A fifth tab, **"5. Metadata Reference"**, was added (`frontend/src/components/MetadataReference.tsx`)
showing a side-by-side Qlik Sense vs. Power BI metadata concept comparison (what's shared between
the platforms vs. platform-specific), independent of the current sample data. See
[METADATA-CAPTURE-REFERENCE.md](./METADATA-CAPTURE-REFERENCE.md) for the full write-up, and
[DATA-REQUEST-CHECKLIST.md](./DATA-REQUEST-CHECKLIST.md) for the field-priority checklist handed
to the Qlik Sense and Power BI admins for the next real-data phase (see "Real-data acquisition
strategy" in the project plan for why this is a manual-export flow, not a live API integration,
for now).

For local (non-Docker) development, copy `.env` into `backend/.env` as well (pydantic-settings
reads `.env` relative to the process working directory), then:

```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --port 8008
cd frontend && npm install && npm run dev
```

## What's Deliberately Out of Scope for Phase 0

- `DataQualityNarratorAgent` from the original plan (narrating the quality/eligibility report in
  plain English) — deferred to Phase 3, since it's explicitly a grounded/audited agent in the
  plan, not a standalone Phase 0 concern.
- Neo4j-backed candidate generation — the interface is ready for it (see decision #6 above), but
  building it against 3×20 sample data would add complexity with no way to prove it's actually
  better than the in-memory version at this scale.
- ~~Live Qlik/Power BI API connections~~ — **reversed; see "Live extraction added" below.**
  Originally out of scope by design (manual admin exports only); live extraction was added in
  a follow-up session and is now available as an opt-in alternative to the sample/manual-export
  path.

### Live extraction added (post-build addition — reverses the original "no live APIs" ground rule)

The original plan's "no live connections" ground rule (Section: "Ground rule for this build")
was an explicit, deliberate decision at the time — it let Phase 0 be fully proven before anyone
touched production credentials. That decision has since been revisited and reversed: the app can
now optionally extract live from both platforms instead of relying solely on manual admin
exports.

- **`app/services/qlik_extractor.py`** — Qlik Sense Enterprise (on-premises), certificate-based
  auth. Pulls app metadata via QRS (`/qrs/app/full`, `/qrs/app/object/full`) and, critically,
  **load script text via a direct Engine API WebSocket connection** — the only way to get
  table/view-level lineage out of Qlik, since QRS doesn't expose it at all. The script is
  regex-parsed for `LIB CONNECT TO` (connection names) and `LOAD/SELECT ... FROM` (table names).
- **`app/services/powerbi_extractor.py`** — Power BI, Azure AD service-principal auth. Runs the
  standard Admin Scanner API scan flow (`getInfo` → `scanStatus` → `scanResult`) with
  `datasetSchema`/`datasetExpressions`/`datasourceDetails`/`lineage` all enabled, and additionally
  parses Power Query M expressions for source-table references.
- **`ingestion.py`** now branches on a single setting (`DATA_SOURCE=sample|live`) — both paths
  produce identically-shaped data, so nothing downstream (eligibility, quality, matching) needed
  to change. This is exactly the design the original plan called for ("sample data mirrors real
  API shape exactly — zero rework when real exports arrive"), just realized via a live call
  instead of a manual export file.
- The existing **"Re-run pipeline"** button in the UI now doubles as the live-extraction trigger
  when `DATA_SOURCE=live` — no new "extract" button/endpoint was needed. A small badge next to
  the app title (`● Sample data` / `● Live data`) always shows which mode is active, via the new
  `GET /api/meta` endpoint.
- **Caveat, stated plainly:** neither extractor has been run against a real Qlik Sense server or
  Power BI tenant — there's no test environment available in this workspace. Both follow the
  platforms' officially documented API conventions, but should be validated (and, per the setup
  doc, adjusted if needed for version-specific QRS field-shape differences) against your actual
  environment before being trusted for real decisions. Full configuration walkthrough — including
  the "if something doesn't work" troubleshooting section — is in
  [LIVE-EXTRACTION-SETUP.md](./LIVE-EXTRACTION-SETUP.md).
- The manual-export path (`DATA-REQUEST-CHECKLIST.md`) remains fully valid and is the recommended
  fallback if live extraction can't be configured (e.g. certificate/network access, Azure AD
  admin availability) in a given environment.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and open [architecture-overview.html](./architecture-overview.html)
in a browser for rendered diagrams. See [DATA-SCHEMAS.md](./DATA-SCHEMAS.md) for the sample data
provenance.

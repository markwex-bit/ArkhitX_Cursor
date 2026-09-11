# Live Extraction Setup — Qlik Sense & Power BI

**Status:** built, but not yet run against a real Qlik Sense server or Power BI tenant
(none available in this environment). Follows documented API conventions for both
platforms — validate against your environment before relying on it, and see the
"If something doesn't work" section at the bottom.

**What this replaces:** the manual JSON-export workflow described in
`DATA-REQUEST-CHECKLIST.md`. That workflow still works and is the safe fallback — this
is an additional, faster path once the two systems below are configured. You can switch
between the two at any time by changing one setting (`DATA_SOURCE`).

---

## How it works, in one paragraph

The app has two data sources: `sample` (reads `samples/*.json`, the default, zero live
calls) and `live` (calls the real Qlik Sense and Power BI admin APIs). Switching is one
environment variable — nothing else in the app changes, because the live extractors
produce data in the exact same shape the sample files already use. Once configured,
clicking **"Re-run pipeline"** in the app triggers a fresh live extraction.

---

## Part 1 — Qlik Sense Enterprise (on-premises)

Uses certificate-based authentication — the standard way to automate against an
on-premises Enterprise deployment (no password/API key involved).

### Step 1 — Export the client certificate

In the **Qlik Management Console (QMC)**:

1. Go to **System > Certificates**.
2. Click **Export Certificates**.
3. Enter the hostname of the machine that will run this app's backend (e.g.
   `localhost` for local runs, or the Docker host's name).
4. Leave "Include secret key" checked, and set an export password if prompted.
5. Download and unzip the export — you'll get `client.pem`, `client_key.pem`, and
   `root.pem`.

### Step 2 — Create/identify a QRS user for this app

The app authenticates as a specific Qlik user (identified by `UserDirectory` +
`UserId`), not a service account with its own password. Any existing user with at least
**read access to the apps you want to extract** (via QMC's security rules) works —
ideally one with broad `RootAdmin` or `ContentAdmin` custom role scoped to the relevant
streams, so a single run covers everything.

### Step 3 — Place the certificate files and set environment variables

Put the three files somewhere the backend can read them:

- **Local (non-Docker) run:** anywhere on disk, e.g. `backend/certs/`.
- **Docker run:** drop them in `projects/qlik-pbi-migration/certs/` — already mounted
  into the backend container at `/certs` in `docker-compose.yml`.

Then set, in `.env` (project root) or `backend/.env` for local runs:

```bash
DATA_SOURCE=live
QLIK_SERVER_URL=https://your-qlik-server.corp.local
QLIK_CLIENT_CERT_PATH=/certs/client.pem       # or full local path for non-Docker runs
QLIK_CLIENT_KEY_PATH=/certs/client_key.pem
QLIK_ROOT_CA_PATH=/certs/root.pem
QLIK_USER_DIRECTORY=CORP                       # your UserDirectory, e.g. from QMC
QLIK_USER_ID=svc-migration-assessor            # the QRS user from Step 2
QLIK_VIRTUAL_PROXY=                            # leave blank unless your site requires one
```

### What gets extracted

- App metadata (name, owner, stream, tags, description, publish status, timestamps) —
  via the QRS REST API (`/qrs/app/full`).
- Master items (measures/dimensions) and sheet titles — via QRS
  (`/qrs/app/object/full`).
- **Load script text** — via a direct Engine API connection (WebSocket, port 4747,
  same certificate). From the script, the app automatically extracts:
  - Data connection names referenced via `LIB CONNECT TO`
  - **Table/view names** referenced in `LOAD ... FROM` / `SELECT ... FROM` statements
    (this is the piece that isn't available via QRS at all — it's the reason the
    Engine API step exists)

If the Engine API step fails for a specific app (e.g. a permissions issue), that one
app's script/table data is simply skipped — its QRS metadata still comes through
normally. Nothing is faked in its place.

---

## Part 2 — Power BI

Uses an Azure AD **service principal** (app registration) — the standard way to
automate against the Power BI Admin APIs without a signed-in user.

### Step 1 — Register an Azure AD app

In the **Azure Portal > Azure Active Directory > App registrations**:

1. **New registration** — any name (e.g. "Qlik-PBI Migration Assessor").
2. Under **Certificates & secrets**, create a **client secret** — copy the value
   immediately (it's only shown once).
3. Note the **Application (client) ID** and **Directory (tenant) ID** from the
   Overview page.

### Step 2 — Allow it to use the Power BI Admin APIs

In the **Power BI Admin Portal** (admin.powerbi.com) > **Tenant settings**:

1. Find **"Allow service principals to use Power BI Admin APIs"**.
2. Enable it, scoped to a **security group**.
3. In **Azure AD**, create a security group (or use an existing one) and add the app
   registration from Step 1 as a member.

### Step 3 — Grant API permissions

Back in the app registration > **API permissions**:

1. Add **Power BI Service > Application permissions > Tenant.Read.All** (or
   `Tenant.ReadWrite.All` if you also want write access — not needed here).
2. Click **Grant admin consent** (requires a tenant admin).

### Step 4 — Set environment variables

```bash
DATA_SOURCE=live
PBI_TENANT_ID=<Directory (tenant) ID from Step 1>
PBI_CLIENT_ID=<Application (client) ID from Step 1>
PBI_CLIENT_SECRET=<the client secret value from Step 1>
PBI_WORKSPACE_IDS=                              # see note below
```

**`PBI_WORKSPACE_IDS`** — comma-separated workspace GUIDs to scan. Recommended: fill
this in explicitly once you have the list (e.g. exported once from the Admin Portal's
workspace list), rather than leaving it blank. If left blank, the app falls back to
auto-discovering workspaces via `/admin/workspaces/modified`, which **only returns
workspaces modified in roughly the last 30 days** — fine for a quick test, not a
complete inventory.

### What gets extracted

- Full workspace → dataset → table/column/measure schema, refresh schedules,
  endorsement, sensitivity labels, lineage — via the Admin Scanner API's standard
  `getInfo` → `scanStatus` → `scanResult` flow, with `datasetSchema=true`,
  `datasetExpressions=true`, `datasourceDetails=true`, `lineage=true` all enabled.
- **Table names** are already part of the standard schema response (no extra step
  needed — this is a difference from Qlik, where table names require the Engine API).
- Power Query M expressions are additionally parsed for `Item="..."` source-table
  references, attached per-table as forward-looking lineage enrichment.

---

## Switching back to sample data

Set `DATA_SOURCE=sample` (or just delete the line — it's the default) and restart the
backend. The app immediately goes back to reading `samples/*.json`, no other change
needed.

---

## If something doesn't work

Both extractors were written against the two platforms' officially documented APIs but
**have not been tested against a live server or tenant** — there's no test environment
available in this workspace. If you hit errors:

- **Qlik "certificate" or TLS errors:** double-check the cert/key/root-CA paths are
  readable by the backend process (inside Docker, that's `/certs/...`), and that the
  hostname used in `QLIK_SERVER_URL` matches what the certificate was exported for.
- **Qlik QRS 401/403:** the `QLIK_USER_DIRECTORY`/`QLIK_USER_ID` pair needs QMC security
  rules granting it read access to the target apps.
- **Qlik master item/sheet fields coming back empty:** QRS's object payload shape
  varies slightly by Qlik Sense version — see the comments in
  `backend/app/services/qlik_extractor.py` (`_object_name`, `_master_item_type`) for
  where to adjust field lookups for your version.
- **Power BI 401:** re-check Part 2, Steps 2–3 — this is almost always the security
  group / admin-API-access setting, not the credentials themselves.
- **Power BI scan times out:** large tenants may need a longer poll loop than the
  ~2 minutes currently coded in `backend/app/services/powerbi_extractor.py`
  (`_run_scan`) — increase the retry count there if needed.

In all cases, the app fails loudly (raises an error) rather than silently falling back
to sample data or partial/fake results — per this workspace's "no mock data or
fallbacks" rule.

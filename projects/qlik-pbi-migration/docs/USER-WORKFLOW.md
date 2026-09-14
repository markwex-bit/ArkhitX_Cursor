# User Workflow — Qlik → Power BI Migration Assessor

One-page guide: load metadata → qualify each platform → find overlap → sign off.

---

## Overview

| Phase | What you do | What the app shows |
|-------|-------------|-------------------|
| **1. Intake** | Load raw Qlik + Power BI metadata | Data source, file/API paths, record counts, **metadata field coverage %** |
| **2. Power BI qualification** | Review exclusion rules (no action unless policy changes) | **Eligible vs excluded** datasets, counts, **%,** reasons |
| **3. Qlik qualification** | Review which Qlik apps are in scope | **Qualified vs excluded** apps, counts, **%,** completeness scores |
| **4. Overlap** | Review matches; optionally run LLM | Match matrix (qualified Qlik × eligible PBI only) |
| **5. Backlog** | Sign off on decisions | Confirmed migration items + CSV export |

**Rule:** Do not trust overlap until Phases 1–3 look right. Matching uses only the **eligible Power BI pool** and **qualified Qlik apps**.

---

## Phase 1 — Load metadata

### Option A — JSON files (recommended first)

1. Export metadata per [`DATA-REQUEST-CHECKLIST.md`](DATA-REQUEST-CHECKLIST.md).
2. Place files:
   - `samples/qlik/qlik_apps_export.json`
   - `samples/powerbi/powerbi_scan_result.json`
3. In **`projects/qlik-pbi-migration/.env`** set: `DATA_SOURCE=sample`
4. Restart: `docker-compose up -d` (from the project folder)
5. Open **http://localhost:3008** → **Intake** tab

Send **unfiltered** exports — the Assessor excludes junk; pre-filtering hides validation gaps.

### Option B — Live APIs

1. Configure Qlik + Power BI credentials in `.env` (see [`LIVE-EXTRACTION-SETUP.md`](LIVE-EXTRACTION-SETUP.md)).
2. Set `DATA_SOURCE=live`
3. Restart containers → **Intake** tab shows live source labels

### Intake tab checks

- **Record counts:** N Qlik apps, M Power BI datasets loaded
- **Metadata coverage:** For each required field, % of apps where that field is populated
- If coverage is low, fix the export or API flags before qualification

---

## Phase 2 — Power BI qualification

**Tab: Power BI**

Deterministic rules in `backend/app/services/eligibility.py` — no LLM.

Each dataset is **eligible** (clean pool) or **excluded** (never matched).

| Exclusion reason | Meaning |
|------------------|---------|
| `personal_workspace` | PersonalGroup / “My workspace” |
| `test_or_sandbox_name` | Test, copy, POC, sandbox naming |
| `orphaned_dataset` | No report on dataset |
| `broken_lineage` | No datasource connections |
| `stale` | No refresh in 180+ days |
| `duplicate` | Near-duplicate of another dataset (one canonical kept) |

**Read the toolbar:** `X scanned · Y eligible (Z%) · W excluded (V%)`

Quality flags (missing description, not endorsed) **do not** remove apps — they warn only.

---

## Phase 3 — Qlik qualification

**Tab: Qlik**

Deterministic rules in `backend/app/services/qlik_qualification.py` (scores from `quality.py`).

Each app is **qualified** (in scope for matching) or **excluded**.

| Exclusion reason | Meaning |
|------------------|---------|
| `below_completeness_threshold` | Completeness score &lt; 0.5 |
| `no_data_connection_identified` | No connection names — blocks lineage match |
| `no_master_items_captured` | No measures/dimensions in export |
| `stale_reload` | Last reload &gt; 180 days ago |

**Read the toolbar:** same good vs eliminated counts and **%** as Power BI.

---

## Phase 4 — Overlap (Match Matrix)

**Tab: Overlap**

- Compares **qualified Qlik apps** to **eligible Power BI datasets** only
- Deterministic signals first: shared connection, name similarity, measure overlap, confidence tier
- **Run LLM analysis** (button) — optional; calls Anthropic for semantic match + advisor
- Select a row → **Candidate detail** → human **sign-off** (required)

---

## Phase 5 — Backlog

**Tab: Backlog**

Only **confirmed** sign-offs appear. Export CSV for downstream migration planning.

---

## Reference docs

| Document | Purpose |
|----------|---------|
| [`DATA-REQUEST-CHECKLIST.md`](DATA-REQUEST-CHECKLIST.md) | Fields to request from admins |
| [`DATA-SCHEMAS.md`](DATA-SCHEMAS.md) | Sample file shapes + proxies |
| [`METADATA-CAPTURE-REFERENCE.md`](METADATA-CAPTURE-REFERENCE.md) | Platform capability comparison (**Reference** tab) |
| [`LIVE-EXTRACTION-SETUP.md`](LIVE-EXTRACTION-SETUP.md) | Live API configuration |

---

## Changing qualification rules

Policy lives in code (no admin UI yet):

- **Power BI:** `backend/app/services/eligibility.py`
- **Qlik:** `backend/app/services/qlik_qualification.py` + `quality.py`

After rule changes, restart the backend and reload the app.

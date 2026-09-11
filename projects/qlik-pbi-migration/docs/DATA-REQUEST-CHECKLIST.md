# Metadata Export Request — Qlik Sense & Power BI

**For:** Qlik Sense admin and Power BI admin
**Purpose:** Provide a metadata export for the Qlik → Power BI Migration Assessor tool. This is a **metadata-only** request — no live API integration is being set up at this time. A one-time (or periodically refreshed) export file from each platform is all that's needed.

**Format:** JSON preferred, one file per platform. One record per app (Qlik) / per dataset (Power BI). Please include a field even if it's empty/null rather than omitting it — an explicit "not available" is more useful to us than a missing key.

---

## 1. Qlik Sense export — requested fields

**Source:** Qlik Sense Repository Service (QRS) API — typically `GET /qrs/app/full` for app records, plus `GET /qrs/dataconnection/full` for connections and `GET /qrs/app/object/full` for sheets/master items.

### Must have

| Field | Notes |
|---|---|
| App id, name | |
| Owner (user id + display name) | |
| Stream / workspace name | |
| Published (true/false), publishTime | |
| Data connection name(s) used by the app | This is our primary cross-platform matching signal — please double-check it's populated per app, not just a site-wide connection list |
| Master item names — measures and dimensions (name + type, e.g. "measure"/"dimension") | Names only is fine |
| Description, tags | |
| Last reload time, created date, modified date | |

### High value — please include if your export tool supports it

| Field | Notes |
|---|---|
| **Full connection details** (server/database/path/type, not just the connection name) | This is the single biggest upgrade you can give us — it turns our lineage matching from a name-based guess into something much closer to certain. If your export can include this, please prioritize it. |
| Sheet titles | |
| Reload task schedule and last execution status/duration | |
| Custom properties (if your org uses them, e.g. department/BU tags) | |

### Nice to have — only if easy to obtain

| Field | Notes |
|---|---|
| Load script text | We understand this may require a live Engine API session per app rather than a simple admin export — include only if it's not extra work for you. If included, please provide as-is (we do not need it parsed/summarized). |
| Session/usage counts (active users, last accessed) | Helps us prioritize which apps matter most, not part of the matching logic itself |

---

## 2. Power BI export — requested fields

**Source:** Power BI/Fabric Admin Scanner API — `POST admin/workspaces/getInfo` with `datasourceDetails=true`, `datasetSchema=true`, `datasetExpressions=true`, `lineage=true`, followed by `GET scanResult/{id}`. If you use a different export method, that's fine — the field list below is what matters, not the specific API call.

### Must have

| Field | Notes |
|---|---|
| Dataset id, name | |
| Workspace id, name, **and type** (Workspace vs. PersonalGroup) | We need to exclude personal "My Workspace" content from candidacy — the `type` field is what lets us do that |
| `datasourceUsages` — connection type + server/database/path | Our primary cross-platform matching signal on this side. Usually included by default when scanning with `datasourceDetails=true`. |
| Table and column names (schema) | |
| Measure names | |
| Refresh schedule (enabled, days, times) and last refresh time | |
| Created date, configuredBy (owner) | |

### High value — please include if your export tool supports it

| Field | Notes |
|---|---|
| **Full DAX measure expressions** | Power BI's Scanner API can return this directly with `datasetExpressions=true` — please enable that flag if you're able to, it's a significant upgrade for us |
| Relationships (table-to-table, cardinality) | |
| Endorsement (Certified/Promoted/None) and sensitivity label | |
| Reports bound to each dataset | |

### Nice to have — only if easy to obtain

| Field | Notes |
|---|---|
| Power Query M expressions | Mirrors the "load script" ask on the Qlik side — turns lineage from a proxy into ground truth |
| Activity/usage events (view/edit/share, per user, per artifact) | Helps prioritize which datasets matter most, not part of matching itself |

---

## Format guidance (both platforms)

- JSON array of records, one object per app/dataset.
- Please don't pre-filter or summarize — send everything in the "Must have" and "High value" tiers even for apps you think are irrelevant, unused, or duplicates. We'll do that filtering on our end and it helps us validate the tool against real edge cases.
- If a field genuinely isn't available (not just empty), a short note (e.g. `"note": "not available via our export tool"`) is more useful than omitting the key silently.
- One export file per platform is fine; multiple files (e.g. per-workspace) are also fine — we'll merge them.

---

## Questions for the admins

If anything above is unclear or infeasible to export, please flag it rather than guessing — we'd rather know a field is unavailable than get inconsistent or approximated data.

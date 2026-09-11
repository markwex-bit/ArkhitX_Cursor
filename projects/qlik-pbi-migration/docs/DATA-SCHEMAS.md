# Data Schemas — Qlik Sense & Power BI Sample Exports

Both sample files in `samples/` are modeled directly on real admin/metadata API response shapes, not invented. This document records exactly which fields are real, which are realistic proxies, and why — so nobody mistakes a sample-data simplification for a hidden assumption.

---

## `samples/qlik/qlik_apps_export.json`

Modeled on **Qlik Sense Repository Service (QRS) API**, merging two real calls the way a real extraction script would:

| Field | Source | Notes |
|---|---|---|
| `id`, `name`, `owner`, `stream`, `published`, `publishTime`, `tags`, `description`, `fileSize`, `lastReloadTime`, `createdDate`, `modifiedDate`, `customProperties`, `savedInProductVersion` | `GET /qrs/app/full` | Real, direct fields |
| `sheets[].title` | `GET /qrs/app/object/full?filter=objectType eq 'sheet'` | Real — title only, no visual layout |
| `masterItems[].name`, `masterItems[].objectType` | `GET /qrs/app/object/full?filter=objectType eq 'measure' or objectType eq 'dimension'` | Real — name/type only |
| `masterItems[].expression` | *(not available via QRS)* | Always `null` here — this is the genuine QRS limitation, not a data-quality defect. Full expressions require the Engine API. |
| `dataConnections[].name` | `GET /qrs/dataconnection/full`, associated by naming convention | **Best-effort proxy, not a guaranteed API mapping.** QRS lists data connections site-wide; which connection a specific app's load script actually uses is not exposed without the Engine API. In practice, connection names are often app/domain-specific enough (e.g. `SALESDW_PROD`) to be a usable — but not certain — lineage hint. Treated as a weak-to-moderate signal, never a certainty, in the matching logic. |

## `samples/powerbi/powerbi_scan_result.json`

Modeled on the **Power BI/Fabric Admin Scanner API** (`POST admin/workspaces/getInfo` → `GET scanResult/{id}`, with `lineage=true`, `datasourceDetails=true`, `datasetSchema=true`, `datasetExpressions=true`):

| Field | Notes |
|---|---|
| `workspaces[].type` | `"Workspace"` (enterprise-governed) or `"PersonalGroup"` (personal "My Workspace") — real distinction, used directly by the eligibility filter |
| `datasets[].tables[].columns`, `.measures[].expression` | Real — DAX expressions are returned when `datasetExpressions=true`. Far richer than anything obtainable from Qlik QRS. |
| `datasets[].datasourceUsages` | Real — connection type + server/database/path. This is the deterministic lineage signal on the Power BI side. |
| `datasets[].endorsementDetails`, `.sensitivityLabel` | Real, but **intentionally omitted on many sample records** — reflects that most tenants don't apply these consistently, which is itself a data-quality finding, not a schema gap. |
| `datasets[].refreshSchedule` | Real. One record (`AP Aging Report`) omits it entirely — deliberately, to simulate "we can't tell if this is stale because the operational metadata was never captured," distinct from "it's stale because it hasn't refreshed in 180+ days." |
| `reports[]` | Some datasets have **no matching report** (e.g. `Supply Chain Dashboard`) — deliberate orphaned-dataset case |

## Why this matters for the tool's confidence claims

Because Qlik QRS cannot expose true table-level lineage, the **primary deterministic cross-platform signal in this sample is a connection-name match** (Qlik `dataConnections[].name` ↔ Power BI `datasourceUsages[].connectionDetails`), not a full table/column intersection. This is weaker than it would be if both platforms exposed equally rich lineage — which is exactly the platform asymmetry called out in the project plan. Where connection names don't match, the tool has to fall back to name/domain/measure-name similarity — a materially weaker signal, and the confidence tiering (see `backend/app/services/confidence.py`) reflects that explicitly rather than hiding it.

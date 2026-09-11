# Metadata Comparison Reference — Qlik Sense vs. Power BI

**Purpose:** A platform capability comparison — every metadata concept either Qlik Sense's or Power BI's real admin/metadata APIs can expose, side by side, with a "Shared?" indicator. This is independent of what the Assessor's current sample data captures (see [`DATA-SCHEMAS.md`](DATA-SCHEMAS.md) for that). Use this to see what's structurally comparable across the two platforms and what genuinely has no equivalent on the other side.

This is also rendered live in the app itself — see the **"5. Metadata Reference"** tab.

---

## Qlik Sense (left) vs. Power BI (right)

| Metadata concept | Qlik Sense | Power BI | Shared? |
|---|---|---|---|
| Identity & ownership | App id, name, owner, stream (QRS) | Dataset id, name, configuredBy, workspace (Scanner API) | Shared |
| Lifecycle timestamps | createdDate, modifiedDate, lastReloadTime (QRS) | createdDate, refresh history lastRefreshTime (Scanner + REST API) | Shared |
| Description & classification | description, tags, customProperties (QRS) | description, sensitivityLabel, endorsement — Certified/Promoted (Scanner API) | Shared |
| Data connections / source pointers | `dataConnections[].name` (QRS) — name only, not guaranteed to map to actual app usage | `datasourceUsages[]` — connection type + server/database/path (Scanner API) | Shared |
| Transformation / business logic | Load script — full ETL logic, joins, source SQL (Engine API only) | Power Query M — full transformation logic (Scanner API, `datasetExpressions=true`) | Shared |
| Calculations (measures/dimensions) | Master items — names via QRS; full expression requires Engine API | Measures — name + full DAX expression, both via Scanner API | Shared |
| Data model (tables/fields/relationships) | Tables, fields, associations, synthetic keys — Engine API only | Tables, columns, relationships (cardinality, cross-filter direction) — Scanner API | Shared |
| Row-level security | Section Access — defined in load script; not exposed via QRS/Engine metadata calls | RLS roles — role name + DAX filter expression (`isEffectiveIdentityRequired`) — Scanner API | Shared |
| Visual / report layer | Sheets — titles via QRS; full visual definitions require Engine API | Reports — id/name/dataset binding via Scanner API; page/visual detail needs separate Report API | Shared |
| Scheduling & refresh operations | Reload tasks — schedule, trigger chains, execution status/duration (QRS) | Refresh schedule + history — enabled/days/times + per-run success/failure (Scanner + REST API) | Shared |
| Access & permissions | Stream access rules, custom security rules (QRS) | Workspace role assignments, sharing links (REST API) | Shared |
| Usage / activity telemetry | Session counts, active users — monitoring apps / License API (separate from QRS) | View/edit/share/export events per user per artifact — Activity Events API (separate from Scanner) | Shared |
| Resource usage / performance | RAM consumption, calc time, load duration — Engine API | Refresh duration, memory — Premium/Fabric Capacity Metrics app (separate from Scanner) | Shared |
| Storage / query mode | N/A — Qlik apps are in-memory (or Direct Discovery); no equivalent mode metadata field | `storageMode` — Import / DirectQuery / Composite / LiveConnection (Scanner API) | **Power BI only** |
| Cross-artifact lineage chains | No structured multi-hop lineage exposed — QVD chaining exists but is not API-visible as lineage | Dataflows + upstream dataset/dataflow lineage (Scanner API, `lineage=true`) | **Power BI only** |
| On-prem gateway / connectivity infra | N/A — Qlik Sense Enterprise typically connects directly; no gateway-mapping metadata | On-prem data gateway cluster mapping per datasource (Admin API) | **Power BI only** |
| File / app size | `fileSize` — QVF app size in bytes (QRS) | Not typically returned by Scanner API — `storageMode` is the closest proxy | **Qlik only** |
| Content library assets | Content library — images/assets referenced by app objects (QRS) | No equivalent concept in Scanner API | **Qlik only** |

---

## Platform-specific concepts (no direct equivalent)

These aren't gaps to fill — they're genuine architecture differences between the two platforms, worth flagging during migration risk assessment since there's nothing to map them to on the other side.

- **Power BI only:** storage/query mode, cross-artifact lineage chains (dataflows), on-prem gateway mapping
- **Qlik only:** app file size, content library assets

---

## Relationship to the current sample data

This document is a *platform* comparison, not a *what's-in-the-sample-data* audit. For a field-by-field breakdown of exactly what `samples/qlik/qlik_apps_export.json` and `samples/powerbi/powerbi_scan_result.json` currently contain — and what's real vs. a best-effort proxy — see [`DATA-SCHEMAS.md`](DATA-SCHEMAS.md).

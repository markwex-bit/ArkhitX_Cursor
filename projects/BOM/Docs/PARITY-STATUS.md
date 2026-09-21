# Excel (.xlsm) Parity Status

Last updated: September 2026

## Feature matrix

| Capability | Excel | Web POC | Notes |
|------------|-------|---------|-------|
| Costbook index + filters | ✅ | ✅ | Region, type, platform, powertrain, milestone |
| Multi-select OR filters (Power BI style) | ✅ | ⚠️ Partial | 5th split multi-select; catalog filters simplified |
| Milestone lifecycle order | ✅ | ✅ | From Config table |
| Single costbook analysis | ✅ | ✅ | Systems, parts, 5th pie |
| 2–5 costbook comparison | ✅ | ✅ | Comparison strip max 5 |
| Currency conversion | ✅ | ✅ | ExchangeRates table, display currency selector |
| Pareto aggregation | ✅ | ✅ | TPC % + cumulative % |
| Two-sided gap Pareto | ✅ | ✅ | Increases then decreases |
| Analysis levels (5th, L1–L3, Part Name, …) | ✅ | ✅ | Level dropdown on Gap tab |
| 5th split filter (exclude/include) | ✅ | ✅ | Multi-toggle on rail |
| Full BOM (Pareto-ranked) | ✅ | ✅ | 80/20 band in UI |
| Aligned BOM gap (part # + occurrence) | ✅ | ✅ | Aligned tab |
| Hierarchical view | ✅ | ✅ | Hierarchy tab |
| Hierarchical by 5th | ✅ | ⚠️ Partial | Data in API; combined in hierarchy export sheet |
| Data Explorer + source links | ✅ | ✅ | Catalog tab + drawer |
| Waterfall chart | ✅ | ✅ | Recharts bar (not native vector) |
| Costbook Report export (4 sheets) | ✅ | ✅ | Excel download |
| Gap Comparison Report export (4 sheets) | ✅ | ✅ | Excel download |
| Explain / LLM narrative | ❌ | ✅ | Template fallback without API key |
| Power Query refresh | ✅ | ⚠️ | Re-run `export_excel_tables.py` + restart |
| Native vector charts in Excel reports | ✅ | ❌ | Reports are tables; charts in browser only |
| PNG per-chart export | ✅ | ❌ | Not implemented |
| modUpdateModules hot-reload | ✅ | N/A | Git deploy instead |

## Data modes

| Mode | Env | Costbooks |
|------|-----|-----------|
| Demo | `DATA_MODE=demo` | 3 vehicles (~4k lines) |
| Full | `DATA_MODE=full` | All ~96k stacked lines |

Set `DATA_MODE=full` in `.env` and restart backend for full catalog parity with the xlsm snapshot.

## Remaining gaps (honest)

1. **Report visual fidelity** — Excel embeds native vector charts on Overview; web exports are structured tables.
2. **Cascading multi-filter UI** — Explorer distinct-per-column with OR semantics not fully replicated in UI.
3. **Gap cumulative % per vehicle** — Full `ComposeGapReport` tail columns not exported column-for-column.
4. **Live SharePoint** — No automatic PQ refresh; manual export script.

## Verification command

```powershell
cd projects/BOM/backend
.\.venv\Scripts\python.exe -c "from app.services.data_store import init_store; from app.services.costbook_engine import CostbookEngine; init_store(); e=CostbookEngine(); print(len(e.build_index()), 'costbooks')"
```

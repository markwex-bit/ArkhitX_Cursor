# BOM / TPC Synthesis Generator — Documentation

Reverse-engineered from `Tools/TPC Database - Synthesis Generator.xlsm` (September 2026).

| Document | Audience | Purpose |
|----------|----------|---------|
| [TPC-SYNTHESIS-GENERATOR-OVERVIEW.md](./TPC-SYNTHESIS-GENERATOR-OVERVIEW.md) | Business, cost engineering, architecture reviewers | **What** the tool does and **why** someone would use it |
| [TPC-SYNTHESIS-GENERATOR-TECHNICAL.md](./TPC-SYNTHESIS-GENERATOR-TECHNICAL.md) | Developers maintaining or replacing the Excel tool | **How** it works — data model, VBA modules, reports, charts |
| [ARKHITX-REBUILD-PLAN.md](./ARKHITX-REBUILD-PLAN.md) | AI solution architects building the ArkhitX replacement | Phase 0 build plan, ontology, agents, and parity checklist |
| [UX-WORKFLOW.md](./UX-WORKFLOW.md) | Product, UX, frontend developers | **Comparison Workspace** — journeys, layout, routes, component map |
| [WORK-PC-DEMO-GUIDE.md](./WORK-PC-DEMO-GUIDE.md) | You, demo on corp laptop | No Docker, no personal keys — copy/GitHub strategy |
| [COPILOT-BUILD-PROMPT.md](./COPILOT-BUILD-PROMPT.md) | VS Code Copilot / CoCo at work | Master prompt to build the POC from Docs |

## Supporting artifacts (analysis)

| Path | Description |
|------|-------------|
| `_extracted_vba/` | Full VBA source extracted from the `.xlsm` (33 modules/forms) |
| `_workbook_analysis.json` | Sheet headers, Power Query connections, table schemas |

## Phase 0 POC (built)

Runnable app at `../` — see **[../README.md](../README.md)** for `run_local.ps1` (no Docker).

## Source file

- **Location:** `../Tools/TPC Database - Synthesis Generator.xlsm`
- **Type:** Excel Macro-Enabled Workbook (`.xlsm`)
- **Origin:** SharePoint — `STLA-Tools/CTPC/TPC Database/WIP - Reports Generator/`
- **Entry point:** Worksheet button → `ShowCostbooksSynthesis()` → modeless `frmCostbooks` form

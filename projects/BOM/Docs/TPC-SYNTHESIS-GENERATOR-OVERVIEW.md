# TPC Synthesis Generator — Overview

## What it is

The **TPC Database — Synthesis Generator** (internally: *CostBooks Synthesis Generator*) is a Stellantis cost-engineering analytics tool built in Excel. It lets cost analysts explore **Total Piece Cost (TPC)** costbooks, compare them across vehicle programs and milestones, and export branded management reports — without writing formulas by hand.

It sits on top of a central **TPC Database** (SharePoint-hosted) that stacks thousands of part-level costbook lines into one workbook via Power Query.

## The problem it solves

Vehicle programs publish costbooks at lifecycle milestones (IM, PM, CM, SOPM, Serial Life, etc.). Each costbook is a full BOM with TPC per part, organized by VSC, macro system, subsystem, PORO, and "5th split" (Platform / Powertrain / Top Hat / Module / TC&Other).

Analysts need to:

1. **Find** the right costbook among hundreds of vehicle × milestone × date combinations
2. **Understand** where cost sits (systems, parts, hierarchy levels)
3. **Compare** two to five costbooks (different trims, milestones, or programs)
4. **Explain gaps** — which systems or parts drove increases or decreases
5. **Export** presentation-ready workbooks for reviews and gate decisions

The Excel tool wraps all of that in a single UI with live charts and one-click report generation.

## Who uses it

- **Cost engineering / CPSA** teams maintaining TPC costbooks
- **Program managers** reviewing milestone cost evolution
- **Architecture / gate reviewers** needing structured gap evidence (feeds initiatives like the *Costed BOM Comparison Agentic AI Chatbot* POC)

## What you can do (three modes)

### Page 1 — Cost Analysis (single costbook)

Pick filters (region, carline type, platform, powertrain, milestone) and one costbook. The tool shows:

- **Cost bars** — TPC by L1 Macro System
- **Pie chart** — TPC by 5th split
- **Top 10 Systems** and **Top 10 Parts** (Pareto-ranked)

**Export:** 4-sheet *Costbook Report* workbook (Overview, Full BOM, Hierarchical View, Hierarchical View by 5th).

### Page 2 — Comparative Analysis (2–3 on screen, up to 5 in export)

Select up to three costbooks for live preview:

- **Waterfall** — TPC walk from baseline through each carline
- **Gap lists** — biggest increases/decreases by analysis level or 5th split

**Export:** 4-sheet *Gap Comparison Report* (Comparison Overview, Full BOM Comparison, Hierarchical Gaps, Hierarchical Gaps by 5th). Export dialog allows up to **five** costbooks with the first as baseline.

### Page 3 — Data Explorer

Browse the full costbook index with multi-select filters (region, project, milestone, type, platform, powertrain, carline). Shows total TPC per costbook, links back to **source SharePoint files**, and supports opening/downloading originals.

## Key concepts

| Term | Meaning |
|------|---------|
| **TPC** | Total Piece Cost — currency value per BOM line |
| **Costbook** | One snapshot: `(Vehicle Code, Milestone, Milestone Date)` |
| **Vehicle Code** | Full carline identifier (matches `CarlinesDefinition.Title`) |
| **Milestone** | Lifecycle gate (IM, PM, CM, SHRM, SOPM, Serial Life, …) |
| **5th split** | High-level cost bucket: Powertrain, Platform, Module, Top Hat, TC&Other |
| **PORO** | Portfolio Responsibility Owner grouping |
| **VSC** | Vehicle System Code |
| **Baseline** | First selected costbook in a comparison; gaps are measured vs baseline |

## Currency handling

Each carline has a **base currency** (EUR, BRL, USD, …). The tool can:

- Show values in **source currency** (no conversion)
- Convert all selected costbooks to a **single display currency** using the `ExchangeRates` table (EUR-based rates by year)

Conversion year logic: SOP year for most milestones; milestone date year for Serial Life.

## Outputs

| Export | Sheets | When |
|--------|--------|------|
| Costbook Report | Overview, Full BOM, Hierarchical View, Hierarchical View by 5th | Single costbook deep-dive |
| Gap Comparison Report | Comparison Overview, Full BOM Comparison, Hierarchical Gaps, Hierarchical Gaps by 5th | Multi-costbook comparison |

Reports open as **new unsaved workbooks** with Stellantis-style branding (navy titles, Segoe UI, Pareto 80/20 bands, red/green gap coloring).

## Data freshness

Four hidden sheets refresh from Power Query against the TPC Database:

- `StackedCostbooks` (~96k+ part lines in current snapshot)
- `CarlinesDefinition` (~130 carlines)
- `CostBookRecords` (index of available costbooks + SharePoint source URLs)
- `ExchangeRates` (currency conversion)

Users refresh data in Excel (Data → Refresh All) before analysis. The VBA layer rebuilds its in-memory index on form open.

## Limitations of the Excel approach

- **Desktop-only** — requires Excel with macros enabled and SharePoint access
- **Monolithic workbook** — ~15 MB, large in-memory tables
- **No audit trail** — who compared what, when, is not logged
- **No natural language** — users must know filters and costbook naming
- **Chart rendering** uses Win32 GDI+ inside Excel — not web-portable
- **Maintenance** — VBA deployed via `modUpdateModules` from a network `src\` folder

These limitations motivate rebuilding as a governed AI application under ArkhitX.

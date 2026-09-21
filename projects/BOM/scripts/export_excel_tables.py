"""Export Power Query tables from the TPC Synthesis Generator xlsm to samples/."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
XLSM = ROOT / "Tools" / "TPC Database - Synthesis Generator.xlsm"
SAMPLES = ROOT / "samples"
SAMPLES.mkdir(parents=True, exist_ok=True)

TABLE_SHEETS = {
    "carlines_definition": "CarlinesDefinition",
    "stacked_costbooks": "StackedCostbooks",
    "costbook_records": "CostBookRecords",
    "exchange_rates": "ExchangeRates",
    "milestones": "Config",
}

DEMO_VEHICLES = [
    "R7P JT Big Horn ICE T4 EVO Hurricane NA TNAP (Toledo)",
    "J4U NA STLA-MEDIUM Laredo ICE EP6 NA Belvidere",
    "DT2 DT Big Horn ICE 3.6L V6 NA SHAP (Sterling Heights)",
]


def read_sheet_table(name: str) -> pd.DataFrame:
    df = pd.read_excel(XLSM, sheet_name=name, engine="openpyxl", dtype=str)
    df.columns = [str(c).strip() for c in df.columns]
    return df.fillna("")


def main() -> None:
    if not XLSM.exists():
        raise SystemExit(f"Missing source workbook: {XLSM}")

    manifest: dict[str, object] = {"source": str(XLSM.name), "tables": {}}

    for key, sheet in TABLE_SHEETS.items():
        df = read_sheet_table(sheet)
        path = SAMPLES / f"{key}.parquet"
        df.to_parquet(path, index=False)
        manifest["tables"][key] = {"rows": len(df), "columns": list(df.columns), "file": path.name}
        print(f"  {key}: {len(df):,} rows -> {path.name}")

    stacked = pd.read_parquet(SAMPLES / "stacked_costbooks.parquet")
    demo = stacked[stacked["Vehicle Code"].isin(DEMO_VEHICLES)].copy()
    demo_path = SAMPLES / "stacked_costbooks_demo.parquet"
    demo.to_parquet(demo_path, index=False)
    manifest["tables"]["stacked_costbooks_demo"] = {
        "rows": len(demo),
        "vehicles": DEMO_VEHICLES,
        "file": demo_path.name,
    }
    print(f"  stacked_costbooks_demo: {len(demo):,} rows -> {demo_path.name}")

    (SAMPLES / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\nWrote {SAMPLES / 'manifest.json'}")


if __name__ == "__main__":
    main()

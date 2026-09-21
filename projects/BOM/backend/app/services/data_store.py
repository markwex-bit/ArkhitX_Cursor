"""Load parquet samples into memory on startup."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.config import get_settings

_store: "DataStore | None" = None


class DataStore:
    def __init__(self, samples_dir: Path, demo_mode: bool) -> None:
        self.carlines = pd.read_parquet(samples_dir / "carlines_definition.parquet")
        stacked_file = (
            "stacked_costbooks_demo.parquet" if demo_mode else "stacked_costbooks.parquet"
        )
        self.stacked = pd.read_parquet(samples_dir / stacked_file)
        self.records = pd.read_parquet(samples_dir / "costbook_records.parquet")
        self.rates = pd.read_parquet(samples_dir / "exchange_rates.parquet")
        self.milestones = pd.read_parquet(samples_dir / "milestones.parquet")

        for df in (self.carlines, self.stacked, self.records, self.rates, self.milestones):
            df.columns = [str(c).strip() for c in df.columns]


def get_store() -> DataStore:
    global _store
    if _store is None:
        settings = get_settings()
        _store = DataStore(Path(settings.samples_dir), settings.data_mode == "demo")
    return _store


def init_store() -> DataStore:
    global _store
    settings = get_settings()
    _store = DataStore(Path(settings.samples_dir), settings.data_mode == "demo")
    return _store

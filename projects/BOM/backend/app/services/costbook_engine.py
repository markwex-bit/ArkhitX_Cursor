"""Port of modCostbookData — full deterministic TPC analysis."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

import pandas as pd

from app.services.data_store import DataStore, get_store

FILTER_ALL = "(All)"
FILTER_SEP = "\n"
CUR_ORIGINAL = "(Source currency)"
LEVEL_NAMES = ["5th", "L1 Macro System", "L2 System", "L3 Subsystem", "Part Name", "Macro System", "Subsystem", "Part Description"]

LEVEL_TO_COL = {
    "5th": "5th",
    "l1 macro system": "L1 Macro System",
    "l1 domain": "L1 Macro System",
    "l2 system": "L2 System",
    "l3 subsystem": "L3 Subsystem",
    "part name": "Normalized Part Name (EN)",
    "macro system": "Macro System",
    "subsystem": "Subsystem",
    "part description": "Part Description",
}

BOM_CTX_COLS = [
    "VSC", "Poro", "PoRo Name", "Macro System", "Subsystem", "VSC Description",
    "Module Code", "Part Description", "Part Number", "LOT", "CPSA",
    "Module Code Description", "Qty", "5th", "Normalized Part Name (EN)",
    "L1 Macro System", "L2 System", "L3 Subsystem", "Classification Method", "Confidence",
]


def date_key(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = str(value).strip()
    if not s:
        return ""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s[:19], fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    try:
        dt = pd.to_datetime(value, errors="coerce")
        if pd.notna(dt):
            return dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    return s


def year_of_key(value: Any) -> int:
    dk = date_key(value)
    if len(dk) >= 4 and dk[:4].isdigit():
        return int(dk[:4])
    return 0


def row_tpc(value: Any) -> float:
    try:
        if value is None or str(value).strip() == "":
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def costbook_key(vehicle: str, milestone: str, dk: str) -> str:
    return f"{vehicle}|{milestone}|{dk}"


def filter_ok(cell: str, flt: str) -> bool:
    if not flt or flt == FILTER_ALL:
        return True
    parts = flt.split(FILTER_SEP)
    return cell in parts


def level_column(level: str) -> str:
    key = level.strip().lower()
    col = LEVEL_TO_COL.get(key, level)
    if col == "L1 Macro System":
        return col
    return col


class CostbookEngine:
    def __init__(self, store: DataStore | None = None) -> None:
        self.store = store or get_store()
        self._index: list[dict[str, Any]] | None = None
        self._attrs: dict[str, dict[str, str]] | None = None
        self._ms_order: dict[str, int] | None = None
        self._rates: dict[str, dict[int, float]] | None = None
        self._source_files: dict[str, tuple[str, str]] | None = None
        self._tpc_totals: dict[str, float] | None = None
        self._rows_cache: dict[str, pd.DataFrame] = {}
        self.display_currency: str = ""

    def _load_rates(self) -> dict[str, dict[int, float]]:
        if self._rates is not None:
            return self._rates
        rates: dict[str, dict[int, float]] = {"EUR": {0: 1.0}}
        for _, row in self.store.rates.iterrows():
            cur = str(row.get("Currency", "")).strip().upper()
            try:
                yr = int(float(row.get("Year", 0)))
                rt = float(row.get("Rate", 0))
            except (TypeError, ValueError):
                continue
            if cur:
                rates.setdefault(cur, {})[yr] = rt
        self._rates = rates
        return rates

    def _load_source_files(self) -> dict[str, tuple[str, str]]:
        if self._source_files is not None:
            return self._source_files
        out: dict[str, tuple[str, str]] = {}
        for _, row in self.store.records.iterrows():
            veh = str(row.get("Vehicle Code", "")).strip()
            ms = str(row.get("Milestone", "")).strip()
            dk = date_key(row.get("Milestone Date", ""))
            url = str(row.get("Source File", "")).strip()
            key = costbook_key(veh, ms, dk)
            name = url.split("/")[-1] if url else "-"
            out[key] = (name, url)
        self._source_files = out
        return out

    def source_file_for(self, vehicle: str, milestone: str, milestone_date: str) -> tuple[str, str]:
        key = costbook_key(vehicle, milestone, date_key(milestone_date))
        return self._load_source_files().get(key, ("-", ""))

    def currency_choices(self) -> list[str]:
        rates = self._load_rates()
        choices = [CUR_ORIGINAL]
        for cur in sorted(rates.keys()):
            if cur not in choices:
                choices.append(cur)
        return choices

    def is_source_currency_choice(self, cur: str) -> bool:
        return not cur or cur == CUR_ORIGINAL or cur.startswith("(Source currency")

    def costbook_year(self, veh: str, ms: str, dk: str) -> int:
        if ms.strip().lower() == "serial life":
            return year_of_key(dk)
        att = self._carline_attrs().get(veh, {})
        sop_y = year_of_key(att.get("sop_date", ""))
        return sop_y or year_of_key(dk)

    def rate_for(self, currency: str, year: int) -> float:
        cur = currency.strip().upper()
        if not cur or cur == "EUR":
            return 1.0
        rates = self._load_rates()
        yd = rates.get(cur, {})
        if year in yd:
            return yd[year]
        if not yd:
            return 0.0
        nearest = min(yd.keys(), key=lambda y: abs(y - year))
        return yd[nearest]

    def _display_currency_key(self) -> str:
        tgt = self.display_currency
        if self.is_source_currency_choice(tgt):
            return "SRC"
        return tgt.strip().upper() or "SRC"

    def conversion_factor(self, veh: str, ms: str, dk: str) -> float:
        tgt = self.display_currency
        if self.is_source_currency_choice(tgt):
            return 1.0
        src = self._carline_attrs().get(veh, {}).get("base_currency", "").strip()
        if not src or src.upper() == tgt.upper():
            return 1.0
        yr = self.costbook_year(veh, ms, dk)
        rs = self.rate_for(src, yr)
        rt = self.rate_for(tgt, yr)
        if rs > 0 and rt > 0:
            return rt / rs
        return 1.0

    def _carline_attrs(self) -> dict[str, dict[str, str]]:
        if self._attrs is not None:
            return self._attrs
        attrs: dict[str, dict[str, str]] = {}
        for _, row in self.store.carlines.iterrows():
            title = str(row.get("Title", "")).strip()
            if not title or title in attrs:
                continue
            attrs[title] = {
                "region": str(row.get("region", "")),
                "carline_type": str(row.get("carline_type", "")),
                "platform": str(row.get("platform", "")),
                "powertrain_type": str(row.get("powertrain_type", "")),
                "base_currency": str(row.get("base_currency", "")),
                "segment": str(row.get("segment", "")),
                "sop_date": date_key(row.get("sop_date", "")),
                "project": str(row.get("project", "")),
                "program": str(row.get("program", "")),
                "pcp_team": str(row.get("pcp_team", "")),
                "ref_person": str(row.get("Reference Person.EMail", "")),
                "commercial_name": str(row.get("commercial_name", "")),
                "plant": str(row.get("plant", "")),
                "brand": str(row.get("brand", "")),
            }
        self._attrs = attrs
        return attrs

    def carline_fields(self, title: str) -> dict[str, str]:
        for _, row in self.store.carlines.iterrows():
            if str(row.get("Title", "")).strip() == title:
                return {str(k): str(row.get(k, "")) for k in row.index}
        return {}

    def milestone_order(self) -> dict[str, int]:
        if self._ms_order is not None:
            return self._ms_order
        order: dict[str, int] = {}
        if "Milestone" in self.store.milestones.columns:
            for _, row in self.store.milestones.iterrows():
                ms = str(row.get("Milestone", "")).strip()
                if ms:
                    try:
                        order[ms] = int(float(row.get("Index", 999)))
                    except (TypeError, ValueError):
                        order[ms] = 999
        self._ms_order = order
        return order

    def phase_of(self, ms: str) -> str:
        o = self.milestone_order()
        idx = o.get(ms.strip(), 999)
        if idx <= 1:
            return "Idea"
        if idx <= 3:
            return "POC"
        if idx <= 5:
            return "INDUS"
        return "RUN"

    def split_values(self) -> list[str]:
        vals = sorted({str(v).strip() for v in self.store.stacked.get("5th", pd.Series()).dropna() if str(v).strip()})
        return [FILTER_ALL, *vals]

    def build_index(self) -> list[dict[str, Any]]:
        if self._index is not None:
            return self._index
        attrs = self._carline_attrs()
        sf_map = self._load_source_files()
        ms_ord = self.milestone_order()
        df = self.store.stacked
        sub = df[["Vehicle Code", "Milestone", "Milestone Date"]].copy()
        sub["vehicle_code"] = sub["Vehicle Code"].astype(str).str.strip()
        sub["milestone"] = sub["Milestone"].astype(str).str.strip()
        sub["milestone_date"] = sub["Milestone Date"].apply(date_key)
        sub = sub[sub["vehicle_code"] != ""]
        sub = sub.drop_duplicates(subset=["vehicle_code", "milestone", "milestone_date"])
        index: list[dict[str, Any]] = []
        for row in sub.itertuples(index=False):
            veh, ms, dk = row.vehicle_code, row.milestone, row.milestone_date
            att = attrs.get(veh, {})
            sf = sf_map.get(costbook_key(veh, ms, dk), ("-", ""))
            index.append(
                {
                    "vehicle_code": veh,
                    "milestone": ms,
                    "milestone_date": dk,
                    "display": f"{veh}  |  {ms}  |  {dk}",
                    "region": att.get("region", ""),
                    "carline_type": att.get("carline_type", ""),
                    "platform": att.get("platform", ""),
                    "powertrain_type": att.get("powertrain_type", ""),
                    "base_currency": att.get("base_currency", ""),
                    "segment": att.get("segment", ""),
                    "sop_date": att.get("sop_date", ""),
                    "project": att.get("project", ""),
                    "program": att.get("program", ""),
                    "pcp_team": att.get("pcp_team", ""),
                    "ref_person": att.get("ref_person", ""),
                    "brand": att.get("brand", ""),
                    "source_file": sf[0],
                    "source_url": sf[1],
                    "phase": self.phase_of(ms),
                }
            )
        index.sort(key=lambda x: (x["vehicle_code"].lower(), ms_ord.get(x["milestone"], 999), x["milestone_date"]))
        self._index = index
        return index

    def _passes_filters(self, item: dict[str, Any], filters: dict[str, list[str]]) -> bool:
        mapping = {
            "region": "region",
            "carline_type": "carline_type",
            "platform": "platform",
            "powertrain": "powertrain_type",
            "milestone": "milestone",
            "vehicle_code": "vehicle_code",
            "project": "project",
            "brand": "brand",
            "control_owner": "ref_person",
        }
        for field, key in mapping.items():
            selected = filters.get(field, [])
            if selected and FILTER_ALL not in selected and item.get(key, "") not in selected:
                return False
        return True

    def filtered_costbooks(self, **filters: list[str]) -> list[dict[str, Any]]:
        return [i for i in self.build_index() if self._passes_filters(i, filters)]

    def distinct_attr(self, field: str, filters: dict[str, list[str]]) -> list[str]:
        fkey = {
            "powertrain": "powertrain_type",
            "control_owner": "ref_person",
        }.get(field, field)
        vals = sorted({i.get(fkey, "") for i in self.build_index() if i.get(fkey, "") and self._passes_filters(i, filters)})
        if field == "milestone":
            ms_ord = self.milestone_order()
            vals.sort(key=lambda v: ms_ord.get(v, 999))
        return [FILTER_ALL, *vals]

    def search(self, q: str, limit: int = 20) -> list[dict[str, Any]]:
        q = q.strip().lower()
        if not q:
            return self.build_index()[:limit]
        return [
            i for i in self.build_index()
            if q in i["vehicle_code"].lower() or q in i.get("project", "").lower() or q in i.get("program", "").lower()
        ][:limit]

    def explorer_data(self, filters: dict[str, list[str]]) -> list[dict[str, Any]]:
        rows = []
        for i in self.filtered_costbooks(**filters):
            cb = {**i, "total_tpc": self.total_tpc(i)}
            rows.append(cb)
        rows.sort(key=lambda r: (r["vehicle_code"].lower(), r["milestone_date"]))
        return rows

    def timeline(self, vehicle_code: str) -> list[dict[str, Any]]:
        items = [i for i in self.build_index() if i["vehicle_code"] == vehicle_code]
        ms_ord = self.milestone_order()
        items.sort(key=lambda x: (ms_ord.get(x["milestone"], 999), x["milestone_date"]))
        return [{**i, "total_tpc": self.total_tpc(i)} for i in items]

    def get_rows(self, vehicle: str, milestone: str, milestone_date: str, fifth_filter: str = FILTER_ALL) -> pd.DataFrame:
        dk = date_key(milestone_date)
        cache_key = f"{costbook_key(vehicle, milestone, dk)}|{fifth_filter or FILTER_ALL}|{self._display_currency_key()}"
        if cache_key in self._rows_cache:
            return self._rows_cache[cache_key]
        df = self.store.stacked
        mask = (
            (df["Vehicle Code"].astype(str).str.strip() == vehicle)
            & (df["Milestone"].astype(str).str.strip() == milestone)
            & (df["Milestone Date"].apply(date_key) == dk)
        )
        rows = df.loc[mask].copy()
        if rows.empty:
            return rows
        factor = self.conversion_factor(vehicle, milestone, dk)
        rows["_tpc_num"] = rows["TPC"].apply(row_tpc) * factor
        if fifth_filter and fifth_filter != FILTER_ALL:
            parts = fifth_filter.split(FILTER_SEP)
            rows = rows[rows["5th"].astype(str).str.strip().isin(parts)]
        rows = rows.sort_values("_tpc_num", ascending=False)
        self._rows_cache[cache_key] = rows
        return rows

    def filter_rows_by_col(self, rows: pd.DataFrame, col: str, value: str) -> pd.DataFrame:
        if rows.empty or not value or value == FILTER_ALL:
            return rows
        if col not in rows.columns:
            return rows.iloc[0:0]
        parts = value.split(FILTER_SEP)

        def match(v: Any) -> bool:
            k = str(v).strip() if str(v).strip() else "(blank)"
            return k in parts

        return rows[rows[col].apply(match)]

    def _load_tpc_totals(self) -> dict[str, float]:
        if self._tpc_totals is not None:
            return self._tpc_totals
        df = self.store.stacked
        keys = (
            df["Vehicle Code"].astype(str).str.strip()
            + "|"
            + df["Milestone"].astype(str).str.strip()
            + "|"
            + df["Milestone Date"].apply(date_key)
        )
        totals = df["TPC"].apply(row_tpc).groupby(keys).sum()
        self._tpc_totals = {str(k): float(v) for k, v in totals.items()}
        return self._tpc_totals

    def total_tpc(self, costbook: dict[str, Any]) -> float:
        key = costbook_key(
            costbook["vehicle_code"],
            costbook["milestone"],
            date_key(costbook["milestone_date"]),
        )
        return self._load_tpc_totals().get(key, 0.0)

    def converted_total_tpc(
        self, costbook: dict[str, Any], fifth_filter: str = FILTER_ALL,
    ) -> float:
        rows = self.get_rows(
            costbook["vehicle_code"],
            costbook["milestone"],
            costbook["milestone_date"],
            fifth_filter,
        )
        if rows.empty:
            return 0.0
        return float(rows["_tpc_num"].sum())

    def pareto_agg(self, rows: pd.DataFrame, by_col: str) -> list[dict[str, Any]]:
        if rows.empty:
            col = level_column(by_col)
            if col not in rows.columns:
                return []
        col = level_column(by_col) if by_col in LEVEL_TO_COL or by_col.lower() in LEVEL_TO_COL else by_col
        if col not in rows.columns:
            for alt in ("L1 Domain", "L1 Macro System"):
                if alt in rows.columns:
                    col = alt
                    break
        if rows.empty or col not in rows.columns:
            return []
        buckets: dict[str, float] = defaultdict(float)
        for _, row in rows.iterrows():
            label = str(row.get(col, "")).strip() or "(blank)"
            buckets[label] += float(row.get("_tpc_num", row_tpc(row.get("TPC"))))
        total = sum(buckets.values()) or 1.0
        out, cum = [], 0.0
        for label, tpc in sorted(buckets.items(), key=lambda x: x[1], reverse=True):
            pct = tpc / total
            cum += pct
            out.append({"label": label, "tpc": round(tpc, 4), "pct": round(pct, 4), "cumulative_pct": round(cum, 4)})
        return out

    def gap_agg(self, costbooks: list[dict[str, Any]], by_col: str, fifth_filter: str = FILTER_ALL) -> list[dict[str, Any]]:
        if len(costbooks) < 2:
            return []
        col = level_column(by_col)
        row_sets = [self.get_rows(c["vehicle_code"], c["milestone"], c["milestone_date"], fifth_filter) for c in costbooks]
        buckets: dict[str, list[float]] = defaultdict(lambda: [0.0] * len(costbooks))
        for ci, rows in enumerate(row_sets):
            if rows.empty:
                continue
            use_col = col if col in rows.columns else by_col
            if use_col not in rows.columns:
                continue
            for _, row in rows.iterrows():
                label = str(row.get(use_col, "")).strip() or "(blank)"
                buckets[label][ci] += float(row.get("_tpc_num", 0))
        results = []
        for label, vals in buckets.items():
            gap = vals[-1] - vals[0]
            results.append({
                "label": label,
                "values": [round(v, 4) for v in vals],
                "gap": round(gap, 4),
                "gap_pct": round(gap / vals[0], 4) if vals[0] else None,
                "abs_gap": abs(gap),
                "side": "increase" if gap > 0 else ("decrease" if gap < 0 else "unchanged"),
            })
        results.sort(key=lambda x: (2 if x["side"] == "unchanged" else (0 if x["side"] == "increase" else 1), -x["abs_gap"]))
        return results

    def aligned_bom_gap(self, costbooks: list[dict[str, Any]], fifth_filter: str = FILTER_ALL) -> list[dict[str, Any]]:
        if len(costbooks) < 2:
            return []
        nc = len(costbooks)
        row_sets = [self.get_rows(c["vehicle_code"], c["milestone"], c["milestone_date"], fifth_filter) for c in costbooks]
        slots: dict[str, int] = {}
        ctx: dict[int, dict[str, str]] = {}
        vals: dict[int, list[float]] = defaultdict(lambda: [0.0] * nc)
        idx = 0
        for ci, rows in enumerate(row_sets):
            if rows.empty:
                continue
            seen: dict[str, int] = defaultdict(int)
            for _, row in rows.iterrows():
                base = str(row.get("Part Number", "")).strip().lower()
                if not base:
                    base = "desc|" + str(row.get("Part Description", "")).strip().lower()
                seen[base] += 1
                key = f"{base}#{seen[base]}"
                if key not in slots:
                    idx += 1
                    slots[key] = idx
                    ctx[idx] = {c: str(row.get(c, "")).strip() for c in BOM_CTX_COLS if c in rows.columns}
                vals[slots[key]][ci] += float(row.get("_tpc_num", 0))
        return self._compose_gap_report(ctx, vals, idx, nc)

    def _compose_gap_report(self, ctx: dict[int, dict[str, str]], vals: dict[int, list[float]], m: int, nc: int) -> list[dict[str, Any]]:
        if m == 0:
            return []
        order = list(range(1, m + 1))
        order.sort(key=lambda i: (
            2 if vals[i][-1] - vals[i][0] == 0 else (0 if vals[i][-1] - vals[i][0] > 0 else 1),
            -abs(vals[i][-1] - vals[i][0]),
        ))
        out = []
        for i in order:
            v = vals[i]
            gap = v[-1] - v[0]
            row = {**ctx.get(i, {}), "values": [round(x, 4) for x in v], "gap": round(gap, 4),
                   "gap_pct": round(gap / v[0], 4) if v[0] else None,
                   "side": "increase" if gap > 0 else ("decrease" if gap < 0 else "unchanged")}
            out.append(row)
        return out

    def full_bom_rows(self, costbook: dict[str, Any], fifth_filter: str = FILTER_ALL) -> list[dict[str, Any]]:
        rows = self.get_rows(costbook["vehicle_code"], costbook["milestone"], costbook["milestone_date"], fifth_filter)
        if rows.empty:
            return []
        total = float(rows["_tpc_num"].sum()) or 1.0
        cum = 0.0
        out = []
        for _, row in rows.iterrows():
            tpc = float(row["_tpc_num"])
            pct = tpc / total
            cum += pct
            out.append({
                "part_number": str(row.get("Part Number", "")),
                "part_description": str(row.get("Part Description", "")),
                "macro_system": str(row.get("Macro System", "")),
                "subsystem": str(row.get("Subsystem", "")),
                "fifth": str(row.get("5th", "")),
                "tpc": round(tpc, 4),
                "pct": round(pct, 4),
                "cumulative_pct": round(cum, 4),
            })
        return out

    def waterfall_data(self, costbooks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not costbooks:
            return []
        points = [{"label": "Baseline", "tpc": round(self.total_tpc(costbooks[0]), 2), "type": "total"}]
        running = self.total_tpc(costbooks[0])
        for i, cb in enumerate(costbooks[1:], start=1):
            t = self.total_tpc(cb)
            delta = t - (self.total_tpc(costbooks[i - 1]) if i > 0 else running)
            points.append({"label": f"V{i + 1}", "tpc": round(t, 2), "delta": round(t - running, 2), "type": "step"})
            running = t
        return points

    @staticmethod
    def _split_order_index(label: str) -> int:
        key = label.lower().strip()
        order = {
            "powertrain": 1, "platform": 2, "module": 3, "modules": 3,
            "top hat": 4, "tc&other": 5, "tc & other": 5, "other": 5,
        }
        return order.get(key, 100)

    def _order_split_labels(self, labels: list[str]) -> list[str]:
        return sorted(labels, key=lambda x: (self._split_order_index(x), x.lower()))

    def _short_car_label(self, cb: dict[str, Any]) -> str:
        veh = cb.get("vehicle_code", "")
        tag = cb.get("project") or (veh.split(" ")[0] if veh else "")
        return f"{tag} · {cb.get('milestone', '')} · {cb.get('milestone_date', '')}"

    def _order_segment_labels(
        self,
        labels: list[str],
        level: str,
        baseline_segments: dict[str, float],
    ) -> list[str]:
        if level.strip().lower() == "5th":
            return self._order_split_labels(labels)
        return sorted(labels, key=lambda x: baseline_segments.get(x, 0.0), reverse=True)

    def _build_capped_segments(
        self,
        ordered_labels: list[str],
        cars: list[dict[str, Any]],
        max_segments: int,
    ) -> tuple[list[str], list[dict[str, Any]]]:
        if len(ordered_labels) <= max_segments:
            labels = ordered_labels
        else:
            labels = ordered_labels[: max_segments - 1] + ["Other"]
        kept = {sl for sl in labels if sl != "Other"}
        segments: list[dict[str, Any]] = []
        for sl in labels:
            if sl == "Other":
                values = [
                    round(sum(v for k, v in c["segments"].items() if k not in kept), 2)
                    for c in cars
                ]
            else:
                values = [round(c["segments"].get(sl, 0.0), 2) for c in cars]
            segments.append({"label": sl, "values": values})
        return labels, segments

    @staticmethod
    def _waterfall_limits(level: str) -> tuple[int, int]:
        """Max bridge steps and end-bar segments before rolling remainder into Other."""
        key = level.strip().lower()
        if key == "5th":
            return 10, 10
        if key in ("l1 macro system", "l1 domain", "macro system"):
            return 24, 24
        if key in ("l2 system", "subsystem"):
            return 32, 32
        if key in ("l3 subsystem",):
            return 32, 32
        if key in ("part name", "part description", "normalized part name (en)"):
            return 25, 25
        return 28, 28

    def waterfall_model(
        self,
        costbooks: list[dict[str, Any]],
        level: str,
        fifth_filter: str = FILTER_ALL,
        max_steps: int | None = None,
        max_segments: int | None = None,
    ) -> dict[str, Any] | None:
        """Stacked end bars at analysis level + gap bridge steps at the same level."""
        if len(costbooks) < 2:
            return None
        lim_steps, lim_segments = self._waterfall_limits(level)
        if max_steps is None:
            max_steps = lim_steps
        if max_segments is None:
            max_segments = lim_segments
        seg_labels: set[str] = set()
        cars: list[dict[str, Any]] = []
        for cb in costbooks:
            rows = self.get_rows(cb["vehicle_code"], cb["milestone"], cb["milestone_date"], fifth_filter)
            agg = self.pareto_agg(rows, level)
            segs = {a["label"]: a["tpc"] for a in agg}
            seg_labels.update(segs.keys())
            label = str(cb.get("vehicle_code", "")).strip() or self._short_car_label(cb)
            cars.append({"label": label, "segments": segs, "total": sum(segs.values())})
        baseline_segs = cars[0]["segments"] if cars else {}
        ordered = self._order_segment_labels(list(seg_labels), level, baseline_segs)
        _, segments = self._build_capped_segments(ordered, cars, max_segments)
        steps: list[list[dict[str, Any]]] = []
        for i in range(len(costbooks) - 1):
            pair = [costbooks[i], costbooks[i + 1]]
            gaps = self.gap_agg(pair, level, fifth_filter)
            step_items = [
                {"label": g["label"], "delta": g["gap"], "side": g["side"]}
                for g in gaps if g["side"] != "unchanged"
            ]
            if len(step_items) > max_steps:
                tail = step_items[max_steps - 1 :]
                other_delta = round(sum(s["delta"] for s in tail), 2)
                step_items = step_items[: max_steps - 1]
                step_items.append({
                    "label": "Other",
                    "delta": other_delta,
                    "side": "increase" if other_delta > 0 else ("decrease" if other_delta < 0 else "unchanged"),
                })
            steps.append(step_items)
        return {
            "car_labels": [c["label"] for c in cars],
            "car_totals": [round(c["total"], 2) for c in cars],
            "segments": segments,
            "steps": steps,
            "total_gap": round(cars[-1]["total"] - cars[0]["total"], 2),
            "segment_level": level,
        }

    def hierarchical_gap_table(
        self,
        costbooks: list[dict[str, Any]],
        fifth_filter: str = FILTER_ALL,
        by_fifth: bool = False,
    ) -> list[dict[str, Any]]:
        """L1/L2/L3 pivot rows; optional 5th prefix. Values per costbook + gap when comparing."""
        if not costbooks:
            return []
        nc = len(costbooks)
        path_cols = (
            ["5th", "L1 Macro System", "L2 System", "L3 Subsystem"]
            if by_fifth
            else ["L1 Macro System", "L2 System", "L3 Subsystem"]
        )

        def col_val(row: pd.Series, c: str) -> str:
            if c not in row.index:
                return "(blank)"
            return str(row.get(c, "")).strip() or "(blank)"

        buckets: dict[tuple[str, ...], list[float]] = defaultdict(lambda: [0.0] * nc)
        for ci, cb in enumerate(costbooks):
            rows = self.get_rows(
                cb["vehicle_code"], cb["milestone"], cb["milestone_date"], fifth_filter,
            )
            if rows.empty:
                continue
            for _, row in rows.iterrows():
                key = tuple(col_val(row, c) for c in path_cols)
                buckets[key][ci] += float(row.get("_tpc_num", 0))

        results: list[dict[str, Any]] = []
        for key, vals in buckets.items():
            gap = vals[-1] - vals[0] if nc >= 2 else 0.0
            entry: dict[str, Any] = {
                "values": [round(v, 4) for v in vals],
                "gap": round(gap, 4) if nc >= 2 else None,
                "gap_pct": round(gap / vals[0], 4) if nc >= 2 and vals[0] else None,
                "side": (
                    "increase" if gap > 0 else ("decrease" if gap < 0 else "unchanged")
                ) if nc >= 2 else "unchanged",
            }
            if by_fifth:
                entry["fifth"] = key[0]
                entry["l1"] = key[1]
                entry["l2"] = key[2]
                entry["l3"] = key[3]
            else:
                entry["l1"] = key[0]
                entry["l2"] = key[1]
                entry["l3"] = key[2]
            results.append(entry)

        def sort_key(r: dict[str, Any]) -> tuple:
            if by_fifth:
                fifth = str(r.get("fifth", ""))
                return (
                    self._split_order_index(fifth),
                    fifth.lower(),
                    str(r.get("l1", "")).lower(),
                    str(r.get("l2", "")).lower(),
                    str(r.get("l3", "")).lower(),
                )
            return (
                str(r.get("l1", "")).lower(),
                str(r.get("l2", "")).lower(),
                str(r.get("l3", "")).lower(),
            )

        results.sort(key=sort_key)
        return results

    def hierarchical_view(self, costbook: dict[str, Any], by_fifth: bool = False) -> list[dict[str, Any]]:
        rows = self.get_rows(costbook["vehicle_code"], costbook["milestone"], costbook["milestone_date"])
        if rows.empty:
            return []
        keys = ["L1 Macro System", "L2 System", "L3 Subsystem", "Normalized Part Name (EN)"]
        for alt in ("L1 Domain",):
            if alt in rows.columns and "L1 Macro System" not in rows.columns:
                keys[0] = alt
        if by_fifth:
            keys = ["5th"] + keys
        results: dict[tuple, float] = defaultdict(float)

        def col_val(row: pd.Series, c: str) -> str:
            if c in row.index:
                return str(row[c]).strip() or "(blank)"
            return "(blank)"

        for _, row in rows.iterrows():
            path = tuple(col_val(row, c) for c in keys if c in rows.columns or c == "5th")
            results[path] += float(row["_tpc_num"])
        total = sum(results.values()) or 1.0
        out = []
        for path, tpc in sorted(results.items(), key=lambda x: x[1], reverse=True):
            out.append({"path": list(path), "tpc": round(tpc, 4), "pct": round(tpc / total, 4)})
        return out

    def cost_structure(
        self,
        costbook: dict[str, Any],
        level: str = "L1 Macro System",
        fifth_filter: str = FILTER_ALL,
    ) -> dict[str, Any]:
        """Single-costbook TPC breakdown at an analysis level (default L1 Macro System)."""
        rows = self.get_rows(
            costbook["vehicle_code"],
            costbook["milestone"],
            costbook["milestone_date"],
            fifth_filter,
        )
        agg = self.pareto_agg(rows, level)
        return {
            "level": level,
            "rows": agg,
            "total_tpc": round(self.total_tpc(costbook), 2),
        }

    def calculate_comparison(
        self,
        costbooks: list[dict[str, Any]],
        level: str = "Macro System",
        fifth_filter: str = FILTER_ALL,
    ) -> dict[str, Any]:
        if not costbooks:
            return {"error": "No costbooks selected"}
        totals = [self.converted_total_tpc(c, fifth_filter) for c in costbooks]
        baseline, compare_total = totals[0], totals[-1]
        single = self.get_rows(costbooks[0]["vehicle_code"], costbooks[0]["milestone"], costbooks[0]["milestone_date"], fifth_filter)
        eff_cur = "" if self.is_source_currency_choice(self.display_currency) else self.display_currency
        sf_map = self._load_source_files()
        return {
            "kpis": {
                "baseline_tpc": round(baseline, 2),
                "compare_tpc": round(compare_total, 2),
                "gap": round(compare_total - baseline, 2),
                "gap_pct": round((compare_total - baseline) / baseline, 4) if baseline else None,
                "costbook_count": len(costbooks),
                "display_currency": eff_cur,
            },
            "costbooks": [
                {
                    **c,
                    "total_tpc": round(totals[i], 2),
                    "carline_fields": self.carline_fields(c["vehicle_code"]),
                    "source_file": sf_map.get(
                        costbook_key(c["vehicle_code"], c["milestone"], date_key(c["milestone_date"])),
                        ("-", ""),
                    )[0],
                    "source_url": sf_map.get(
                        costbook_key(c["vehicle_code"], c["milestone"], date_key(c["milestone_date"])),
                        ("-", ""),
                    )[1],
                }
                for i, c in enumerate(costbooks)
            ],
            "totals": [round(t, 2) for t in totals],
            "fifth_split": self.pareto_agg(single, "5th"),
            "systems": self.pareto_agg(single, "Macro System"),
            "parts": self.pareto_agg(single, "Part Description")[:10],
            "gap_drivers": self.gap_agg(costbooks, level, fifth_filter),
            "aligned_bom": self.aligned_bom_gap(costbooks, fifth_filter),
            "full_bom": self.full_bom_rows(costbooks[0], fifth_filter),
            "waterfall": self.waterfall_data(costbooks),
            "waterfall_model": self.waterfall_model(costbooks, level, fifth_filter),
            "hierarchical": self.hierarchical_view(costbooks[0]),
            "hierarchical_by_fifth": self.hierarchical_view(costbooks[0], by_fifth=True),
            "hierarchy_l123": self.hierarchical_gap_table(costbooks, fifth_filter, by_fifth=False),
            "hierarchy_l123_by_fifth": self.hierarchical_gap_table(costbooks, fifth_filter, by_fifth=True),
            "gap_hierarchical": self.gap_agg(costbooks, "L1 Macro System", fifth_filter),
            "level": level,
            "level_names": LEVEL_NAMES,
            "split_values": self.split_values(),
            "currency_choices": self.currency_choices(),
        }

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services.costbook_engine import FILTER_ALL, LEVEL_NAMES, CostbookEngine
from app.services.llm_provider import explain_comparison
from app.services.report_service import export_costbook_report, export_gap_report

router = APIRouter()
engine = CostbookEngine()


class CostbookRef(BaseModel):
    vehicle_code: str
    milestone: str
    milestone_date: str


class CalculateRequest(BaseModel):
    costbooks: list[CostbookRef] = Field(min_length=1, max_length=5)
    level: str = "Macro System"
    display_currency: str = ""
    fifth_filter: str = FILTER_ALL


class StructureRequest(BaseModel):
    costbook: CostbookRef
    level: str = "L1 Macro System"
    display_currency: str = ""
    fifth_filter: str = FILTER_ALL


class ExplainRequest(BaseModel):
    comparison: dict[str, Any]
    question: str = ""


def _split_param(v: str) -> list[str]:
    if not v or v == FILTER_ALL:
        return []
    return [p.strip() for p in v.split("|") if p.strip()]


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "project": "Costed BOM Comparison"}


@router.get("/meta")
def meta() -> dict[str, Any]:
    return {
        "level_names": LEVEL_NAMES,
        "split_values": engine.split_values(),
        "currency_choices": engine.currency_choices(),
    }


@router.get("/costbooks/search")
def search_costbooks(q: str = "", limit: int = 20) -> list[dict[str, Any]]:
    return engine.search(q, limit=limit)


@router.get("/carlines/timeline")
def carline_timeline(vehicle_code: str) -> list[dict[str, Any]]:
    items = engine.timeline(vehicle_code)
    if not items:
        raise HTTPException(404, f"No costbooks for vehicle: {vehicle_code}")
    return items


def _catalog_filters(
    region: str = FILTER_ALL,
    carline_type: str = FILTER_ALL,
    platform: str = FILTER_ALL,
    powertrain: str = FILTER_ALL,
    milestone: str = FILTER_ALL,
    project: str = FILTER_ALL,
    vehicle_code: str = FILTER_ALL,
    brand: str = FILTER_ALL,
    control_owner: str = FILTER_ALL,
) -> dict[str, list[str]]:
    return {
        "region": _split_param(region),
        "carline_type": _split_param(carline_type),
        "platform": _split_param(platform),
        "powertrain": _split_param(powertrain),
        "milestone": _split_param(milestone),
        "project": _split_param(project),
        "vehicle_code": _split_param(vehicle_code),
        "brand": _split_param(brand),
        "control_owner": _split_param(control_owner),
    }


@router.get("/catalog")
def catalog(
    region: str = FILTER_ALL,
    carline_type: str = FILTER_ALL,
    platform: str = FILTER_ALL,
    powertrain: str = FILTER_ALL,
    milestone: str = FILTER_ALL,
    project: str = FILTER_ALL,
    vehicle_code: str = FILTER_ALL,
    brand: str = FILTER_ALL,
    control_owner: str = FILTER_ALL,
    display_currency: str = "",
) -> list[dict[str, Any]]:
    engine.display_currency = display_currency
    return engine.explorer_data(_catalog_filters(
        region, carline_type, platform, powertrain, milestone, project, vehicle_code, brand, control_owner,
    ))


@router.get("/filters/{field}")
def filter_options(
    field: str,
    region: str = FILTER_ALL,
    carline_type: str = FILTER_ALL,
    platform: str = FILTER_ALL,
    powertrain: str = FILTER_ALL,
    milestone: str = FILTER_ALL,
    project: str = FILTER_ALL,
    brand: str = FILTER_ALL,
    control_owner: str = FILTER_ALL,
) -> list[str]:
    allowed = {
        "region", "carline_type", "platform", "powertrain", "milestone",
        "project", "vehicle_code", "brand", "control_owner",
    }
    if field not in allowed:
        raise HTTPException(400, f"Unknown filter field: {field}")
    filters = _catalog_filters(
        region, carline_type, platform, powertrain, milestone, project, FILTER_ALL, brand, control_owner,
    )
    return engine.distinct_attr(field, filters)


@router.post("/comparisons/calculate")
def calculate(req: CalculateRequest) -> dict[str, Any]:
    engine.display_currency = req.display_currency
    costbooks = [c.model_dump() for c in req.costbooks]
    return engine.calculate_comparison(costbooks, level=req.level, fifth_filter=req.fifth_filter)


@router.post("/analysis/structure")
def cost_structure(req: StructureRequest) -> dict[str, Any]:
    engine.display_currency = req.display_currency
    cb = req.costbook.model_dump()
    out = engine.cost_structure(cb, level=req.level, fifth_filter=req.fifth_filter)
    return {**out, "costbook": cb}


@router.post("/explain")
def explain(req: ExplainRequest) -> dict[str, Any]:
    return explain_comparison(req.question, req.comparison)


@router.post("/reports/costbook")
def report_costbook(req: CalculateRequest) -> Response:
    engine.display_currency = req.display_currency
    cb = req.costbooks[0].model_dump()
    data = export_costbook_report(engine, cb)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Costbook_Report.xlsx"'},
    )


@router.post("/reports/gap")
def report_gap(req: CalculateRequest) -> Response:
    if len(req.costbooks) < 2:
        raise HTTPException(400, "Gap report requires at least 2 costbooks")
    engine.display_currency = req.display_currency
    costbooks = [c.model_dump() for c in req.costbooks]
    data = export_gap_report(engine, costbooks)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Gap_Comparison_Report.xlsx"'},
    )

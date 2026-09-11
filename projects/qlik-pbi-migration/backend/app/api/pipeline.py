from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.catalog import (
    BacklogEntry,
    EligibilitySummary,
    ParityRow,
    QlikDispositionResult,
    QlikQualityResult,
    SignOffRecord,
    SignOffRequest,
)
from app.services import ingestion, pipeline, signoff

router = APIRouter()


@router.get("/meta")
def get_meta():
    """Reports which data source the pipeline is currently reading from —
    surfaced in the UI so it's always obvious whether results reflect sample
    data or a live Qlik/Power BI extraction."""
    settings = get_settings()
    return {"data_source": settings.data_source}


@router.get("/eligibility", response_model=EligibilitySummary)
def get_eligibility():
    """Stage 0a — Power BI eligibility report. Aggregate counts by exclusion
    reason, never per-app narrative (per the project's explicit scoping)."""
    result = pipeline.run_pipeline_cached(use_llm=True)
    return result.eligibility_summary


@router.get("/quality/qlik", response_model=list[QlikQualityResult])
def get_qlik_quality():
    """Stage 0b — Qlik inventory quality pass."""
    result = pipeline.run_pipeline_cached(use_llm=True)
    return result.qlik_quality


@router.get("/quality/parity", response_model=list[ParityRow])
def get_parity_matrix():
    """Cross-platform capability parity matrix — what's even obtainable from
    each platform's admin API, independent of any specific app's data."""
    result = pipeline.run_pipeline_cached(use_llm=True)
    return result.parity_matrix


@router.get("/dispositions", response_model=list[QlikDispositionResult])
def get_dispositions():
    """Full pipeline: eligibility -> quality -> candidate generation ->
    semantic match -> confidence tiering -> advisor recommendation.
    Every recommendation here still requires human sign-off before it can
    reach the migration backlog."""
    result = pipeline.run_pipeline_cached(use_llm=True)
    return result.dispositions


@router.post("/dispositions/refresh")
def refresh_dispositions():
    """Clears the pipeline cache and re-runs everything (including LLM
    calls). Use sparingly — this re-triggers real Anthropic API calls."""
    ingestion.load_qlik_apps.cache_clear()
    ingestion.load_pbi_apps.cache_clear()
    pipeline.run_pipeline_cached.cache_clear()
    result = pipeline.run_pipeline_cached(use_llm=True)
    return {"status": "refreshed", "qlik_apps": len(result.dispositions)}


@router.post("/signoff", response_model=SignOffRecord)
def post_signoff(request: SignOffRequest, db: Session = Depends(get_db)):
    """Stage 4 — the mandatory human sign-off gate. No automatic sunset
    action happens anywhere else in this codebase."""
    return signoff.create_signoff(db, request)


@router.get("/signoffs")
def get_signoffs(db: Session = Depends(get_db)):
    rows = signoff.list_signoffs(db)
    return [
        {
            "qlik_app_id": r.qlik_app_id,
            "pbi_dataset_id": r.pbi_dataset_id,
            "decision": r.decision,
            "reviewer": r.reviewer,
            "notes": r.notes,
            "timestamp": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/backlog", response_model=list[BacklogEntry])
def get_backlog(db: Session = Depends(get_db)):
    """Stage 5 — only Qlik apps with a 'confirmed' sign-off appear here."""
    result = pipeline.run_pipeline_cached(use_llm=True)
    dispositions_by_id = {d.qlik_app_id: d for d in result.dispositions}
    return signoff.build_backlog(db, dispositions_by_id)


@router.get("/backlog/export.csv")
def export_backlog_csv(db: Session = Depends(get_db)):
    result = pipeline.run_pipeline_cached(use_llm=True)
    dispositions_by_id = {d.qlik_app_id: d for d in result.dispositions}
    entries = signoff.build_backlog(db, dispositions_by_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "qlik_app_id", "qlik_app_name", "pbi_dataset_id", "pbi_name",
            "disposition", "confidence_tier", "effort", "decision", "reviewer",
            "notes", "timestamp",
        ]
    )
    for e in entries:
        writer.writerow(
            [
                e.qlik_app_id, e.qlik_app_name, e.pbi_dataset_id or "", e.pbi_name or "",
                e.disposition.value if e.disposition else "",
                e.confidence_tier.value if e.confidence_tier else "",
                e.effort or "", e.decision.value, e.reviewer, e.notes, e.timestamp,
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=migration_backlog.csv"},
    )

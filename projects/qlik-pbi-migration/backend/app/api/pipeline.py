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
    IntakeSummary,
    MetadataCoverageReport,
    ParityRow,
    QlikDispositionResult,
    QlikQualificationSummary,
    QlikQualityResult,
    SignOffRecord,
    SignOffRequest,
)
from app.services import ingestion, intake, metadata_coverage, pipeline, signoff

router = APIRouter()


@router.get("/meta")
def get_meta():
    """Reports which data source the pipeline is currently reading from —
    surfaced in the UI so it's always obvious whether results reflect sample
    data or a live Qlik/Power BI extraction."""
    settings = get_settings()
    return {
        "data_source": settings.data_source,
        "llm_analysis_ready": pipeline.llm_analysis_ready(),
    }


@router.get("/intake", response_model=IntakeSummary)
def get_intake():
    """Phase 1 — data source paths, app counts, and load instructions."""
    return intake.get_intake_summary()


@router.get("/metadata-coverage", response_model=list[MetadataCoverageReport])
def get_metadata_coverage():
    """Phase 1 — field-level coverage % vs DATA-REQUEST-CHECKLIST for each platform."""
    qlik_apps = ingestion.load_qlik_apps()
    pbi_apps = ingestion.load_pbi_apps()
    return metadata_coverage.evaluate_coverage(qlik_apps, pbi_apps)


@router.get("/eligibility", response_model=EligibilitySummary)
def get_eligibility():
    """Stage 0a — Power BI eligibility report. Aggregate counts by exclusion
    reason, never per-app narrative (per the project's explicit scoping)."""
    result = pipeline.get_deterministic_pipeline()
    return result.eligibility_summary


@router.get("/qualification/qlik", response_model=QlikQualificationSummary)
def get_qlik_qualification():
    """Phase 3 — Qlik qualified vs excluded (symmetric to PBI eligibility)."""
    result = pipeline.get_deterministic_pipeline()
    return result.qlik_qualification_summary


@router.get("/quality/qlik", response_model=list[QlikQualityResult])
def get_qlik_quality():
    """Per-app completeness scores (detail behind Qlik qualification)."""
    result = pipeline.get_deterministic_pipeline()
    return result.qlik_quality


@router.get("/quality/parity", response_model=list[ParityRow])
def get_parity_matrix():
    """Cross-platform capability parity matrix — what's even obtainable from
    each platform's admin API, independent of any specific app's data."""
    result = pipeline.get_deterministic_pipeline()
    return result.parity_matrix


@router.get("/dispositions", response_model=list[QlikDispositionResult])
def get_dispositions():
    """Deterministic pipeline by default. Returns LLM-enriched dispositions
    only if the user already triggered POST /dispositions/refresh this session."""
    result = pipeline.get_dispositions_pipeline()
    return result.dispositions


@router.post("/dispositions/refresh", response_model=list[QlikDispositionResult])
def refresh_dispositions():
    """Explicit user action — runs semantic match + migration advisor (LLM)."""
    result = pipeline.refresh_pipeline_with_llm()
    return result.dispositions


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
    result = pipeline.get_dispositions_pipeline()
    dispositions_by_id = {d.qlik_app_id: d for d in result.dispositions}
    return signoff.build_backlog(db, dispositions_by_id)


@router.get("/backlog/export.csv")
def export_backlog_csv(db: Session = Depends(get_db)):
    result = pipeline.get_dispositions_pipeline()
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

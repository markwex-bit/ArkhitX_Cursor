"""
Stage 4 — Mandatory human sign-off gate, and Stage 5 — migration backlog.

No Qlik app is ever marked "safe to sunset" by the pipeline alone (see
migration_advisor_agent.py's `requires_human_review` flag). This module is
the only path by which a recommendation becomes a backlog entry, and it
always requires an explicit reviewer action.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.governance.arkhitx_client import get_arkhitx_client
from app.models.catalog import BacklogEntry, SignOffRecord, SignOffRequest
from app.models.db_models import SignOffDB


def _log_signoff_governance(request: SignOffRequest) -> None:
    client = get_arkhitx_client()
    if not client:
        return

    items = {
        "qlik_app_id": request.qlik_app_id,
        "pbi_dataset_id": request.pbi_dataset_id,
        "decision": request.decision.value,
    }
    audit_id = client.log_audit(
        actor=request.reviewer,
        action=f"signoff_{request.decision.value}",
        context={
            "scope": "solution",
            "stage": "HITL Sign-off",
            "process_group": "Migration Assessor Pipeline",
            "step_name": "Migration sign-off",
            "step_type": "Gate + HITL",
            **items,
            "notes": request.notes,
        },
        result={"success": True, "message": request.notes or request.decision.value},
    )
    client.log_gate_decision(
        gate_name="migration_signoff",
        decision=request.decision.value,
        reviewer=request.reviewer,
        notes=request.notes,
        items_reviewed=items,
    )
    client.log_pipeline_step(
        step_name=f"Sign-off: {request.qlik_app_id}",
        status="completed",
        stage="HITL Sign-off",
        process_group="Migration Assessor Pipeline",
        agent=request.reviewer,
        step_type="Gate + HITL",
        input_summary={"scope": "solution", **items, "notes": request.notes},
        output_summary={
            "audit_id": audit_id,
            "summary": request.notes or f"Decision: {request.decision.value}",
            "confidence": 1.0,
        },
    )


def create_signoff(db: Session, request: SignOffRequest) -> SignOffRecord:
    record = SignOffDB(
        qlik_app_id=request.qlik_app_id,
        pbi_dataset_id=request.pbi_dataset_id,
        decision=request.decision.value,
        reviewer=request.reviewer,
        notes=request.notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    _log_signoff_governance(request)

    return SignOffRecord(
        qlik_app_id=record.qlik_app_id,
        pbi_dataset_id=record.pbi_dataset_id,
        decision=request.decision,
        reviewer=record.reviewer,
        notes=record.notes,
        timestamp=record.created_at.isoformat() if record.created_at else datetime.now(timezone.utc).isoformat(),
    )


def list_signoffs(db: Session) -> list[SignOffDB]:
    return db.query(SignOffDB).order_by(SignOffDB.created_at.desc()).all()


def latest_signoff_by_qlik_app(db: Session) -> dict[str, SignOffDB]:
    """Most recent sign-off per Qlik app (later decisions supersede earlier ones)."""
    latest: dict[str, SignOffDB] = {}
    for row in list_signoffs(db):  # already ordered desc, so first-seen per app is latest
        if row.qlik_app_id not in latest:
            latest[row.qlik_app_id] = row
    return latest


def build_backlog(db: Session, dispositions_by_qlik_id: dict) -> list[BacklogEntry]:
    """Only Qlik apps with a "confirmed" sign-off appear in the backlog.
    "overridden" and "needs_more_info" are tracked but intentionally excluded
    from the exportable backlog — they are not yet actionable."""
    entries: list[BacklogEntry] = []
    for row in list_signoffs(db):
        if row.decision != "confirmed":
            continue
        disposition_result = dispositions_by_qlik_id.get(row.qlik_app_id)
        if not disposition_result:
            continue

        candidate = None
        if row.pbi_dataset_id:
            candidate = next(
                (c for c in disposition_result.candidates if c.pbi_dataset_id == row.pbi_dataset_id),
                None,
            )
        elif disposition_result.candidates:
            candidate = disposition_result.candidates[0]

        entries.append(
            BacklogEntry(
                qlik_app_id=row.qlik_app_id,
                qlik_app_name=disposition_result.qlik_app_name,
                pbi_dataset_id=candidate.pbi_dataset_id if candidate else None,
                pbi_name=candidate.pbi_name if candidate else None,
                disposition=disposition_result.disposition,
                confidence_tier=candidate.confidence_tier if candidate else None,
                effort=candidate.effort if candidate else None,
                decision=row.decision,
                reviewer=row.reviewer,
                notes=row.notes or "",
                timestamp=row.created_at.isoformat() if row.created_at else "",
            )
        )
    return entries

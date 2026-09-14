"""
Phase A (Architecture & Design) API
====================================

Everything needed to run the pre-build architecture gate: pick a tier
(lightweight | full), author/draft the required documents, log Architecture
Decision Records (ADRs), and check readiness before the architecture_gate
sign-off (POST /api/projects/{id}/gates/architecture_gate/decide, in
app/api/projects.py) advances the project from Phase A (-1) to Phase 0 (Build).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.architecture_document import ArchitectureDocument
from app.models.architecture_decision import ArchitectureDecision
from app.architecture_catalog import CATALOG, docs_for_tier, catalog_by_key
from app.services.audit_service import log_audit

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────

class TierSelection(BaseModel):
    tier: str  # "lightweight" | "full"
    review_mode: str = "self"  # "self" | "stakeholder"


class DocumentUpdate(BaseModel):
    content: str | None = None
    status: str | None = None  # not_started | draft | in_review | approved


class DraftRequest(BaseModel):
    regenerate: bool = False  # if True, overwrite even if content already exists


class DecisionCreate(BaseModel):
    title: str
    context: str = ""
    options_considered: list[dict] = []
    decision: str = ""
    consequences: str = ""
    status: str = "proposed"


class DecisionUpdate(BaseModel):
    title: str | None = None
    context: str | None = None
    options_considered: list[dict] | None = None
    decision: str | None = None
    consequences: str | None = None
    status: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────

def _get_project(db: Session, project_id: str) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return project


def _get_document(db: Session, project_id: str, doc_key: str) -> ArchitectureDocument:
    doc = (
        db.query(ArchitectureDocument)
        .filter(ArchitectureDocument.project_id == project_id, ArchitectureDocument.doc_key == doc_key)
        .first()
    )
    if not doc:
        raise HTTPException(404, f"Document '{doc_key}' not found for this project — has a tier been chosen?")
    return doc


def _serialize_document(doc: ArchitectureDocument) -> dict:
    return {
        "id": str(doc.id),
        "doc_key": doc.doc_key,
        "title": doc.title,
        "category": doc.category,
        "tier": doc.tier,
        "sort_order": doc.sort_order,
        "content": doc.content or "",
        "status": doc.status,
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


def _serialize_decision(d: ArchitectureDecision) -> dict:
    return {
        "id": str(d.id),
        "title": d.title,
        "context": d.context or "",
        "options_considered": d.options_considered or [],
        "decision": d.decision or "",
        "consequences": d.consequences or "",
        "status": d.status,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


def _readiness(db: Session, project: Project) -> dict:
    docs = db.query(ArchitectureDocument).filter(ArchitectureDocument.project_id == project.id).all()
    total = len(docs)
    by_status = {"not_started": 0, "draft": 0, "in_review": 0, "approved": 0}
    for doc in docs:
        by_status[doc.status] = by_status.get(doc.status, 0) + 1
    decisions_count = (
        db.query(ArchitectureDecision).filter(ArchitectureDecision.project_id == project.id).count()
    )
    blocking = [
        {"doc_key": doc.doc_key, "title": doc.title, "status": doc.status}
        for doc in docs
        if doc.status in ("not_started", "draft")
    ]
    return {
        "tier": project.architecture_tier,
        "review_mode": project.architecture_review_mode,
        "total_documents": total,
        "by_status": by_status,
        "decisions_logged": decisions_count,
        "ready_for_review": total > 0 and by_status.get("not_started", 0) == 0,
        "outstanding": blocking,
    }


# ── Catalog ──────────────────────────────────────────────────────────────

@router.get("/{project_id}/architecture/catalog")
def get_catalog(project_id: str, db: Session = Depends(get_db)):
    """Full catalog with lightweight/full membership — used to render the tier picker."""
    project = _get_project(db, project_id)
    return {
        "catalog": CATALOG,
        "lightweight_count": len(docs_for_tier("lightweight")),
        "full_count": len(docs_for_tier("full")),
        "current_tier": project.architecture_tier,
        "current_review_mode": project.architecture_review_mode,
    }


# ── Tier selection ───────────────────────────────────────────────────────

@router.post("/{project_id}/architecture/tier")
def set_tier(project_id: str, body: TierSelection, db: Session = Depends(get_db)):
    if body.tier not in ("lightweight", "full"):
        raise HTTPException(400, "tier must be 'lightweight' or 'full'")
    if body.review_mode not in ("self", "stakeholder"):
        raise HTTPException(400, "review_mode must be 'self' or 'stakeholder'")

    project = _get_project(db, project_id)
    project.architecture_tier = body.tier
    project.architecture_review_mode = body.review_mode
    db.commit()

    # Create any missing document rows for this tier. Never demotes/deletes
    # rows if a project is upgraded lightweight -> full later; only adds.
    existing_keys = {
        row.doc_key
        for row in db.query(ArchitectureDocument.doc_key)
        .filter(ArchitectureDocument.project_id == project.id)
        .all()
    }
    created = 0
    for order, entry in enumerate(docs_for_tier(body.tier)):
        if entry["key"] in existing_keys:
            continue
        db.add(ArchitectureDocument(
            project_id=project.id,
            doc_key=entry["key"],
            title=entry["title"],
            category=entry["category"],
            tier=entry["tier"],
            sort_order=order,
            content="",
            status="not_started",
        ))
        created += 1
    db.commit()

    log_audit(db, project_id=project_id, actor="consultant", action="architecture_tier_selected",
              context={"tier": body.tier, "review_mode": body.review_mode, "documents_created": created})

    return {"status": "ok", "tier": body.tier, "review_mode": body.review_mode, "documents_created": created}


# ── Documents ────────────────────────────────────────────────────────────

@router.get("/{project_id}/architecture/documents")
def list_documents(project_id: str, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    docs = (
        db.query(ArchitectureDocument)
        .filter(ArchitectureDocument.project_id == project_id)
        .order_by(ArchitectureDocument.sort_order)
        .all()
    )
    return [_serialize_document(d) for d in docs]


@router.get("/{project_id}/architecture/documents/{doc_key}")
def get_document(project_id: str, doc_key: str, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    return _serialize_document(_get_document(db, project_id, doc_key))


@router.patch("/{project_id}/architecture/documents/{doc_key}")
def update_document(project_id: str, doc_key: str, body: DocumentUpdate, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    doc = _get_document(db, project_id, doc_key)

    if body.content is not None:
        doc.content = body.content
        # Editing content out of a not_started state moves it to draft
        # automatically unless the caller explicitly set a status too.
        if doc.status == "not_started" and body.status is None:
            doc.status = "draft"
    if body.status is not None:
        if body.status not in ("not_started", "draft", "in_review", "approved"):
            raise HTTPException(400, "invalid status")
        doc.status = body.status

    db.commit()
    db.refresh(doc)
    log_audit(db, project_id=project_id, actor="consultant", action="architecture_document_updated",
              context={"doc_key": doc_key, "status": doc.status})
    return _serialize_document(doc)


@router.post("/{project_id}/architecture/documents/{doc_key}/draft")
def draft_document(project_id: str, doc_key: str, body: DraftRequest, db: Session = Depends(get_db)):
    """AI-assisted first draft of one architecture document from intake context."""
    project = _get_project(db, project_id)
    doc = _get_document(db, project_id, doc_key)

    if doc.content.strip() and not body.regenerate:
        raise HTTPException(409, "Document already has content — pass regenerate=true to overwrite/revise")

    catalog_entry = catalog_by_key().get(doc_key)
    if not catalog_entry:
        raise HTTPException(400, f"Unknown doc_key '{doc_key}'")

    try:
        from app.agents.architecture_document_agent import ArchitectureDocumentAgent
        agent = ArchitectureDocumentAgent(db)
        drafted = agent.run(
            project_context={
                "name": project.name,
                "client_name": project.client_name,
                "description": project.description,
                "pain_points": project.pain_points or {},
            },
            doc_title=doc.title,
            doc_guidance=catalog_entry["guidance"],
            existing_content=doc.content if body.regenerate else "",
            as_built_context=project.as_built_notes or "",
        )
    except Exception as e:
        raise HTTPException(500, f"Drafting agent failed: {e}")

    doc.content = drafted
    doc.status = "draft"
    db.commit()
    db.refresh(doc)

    log_audit(db, project_id=project_id, actor="agent:arkhitx-architecture-drafter",
              action="architecture_document_drafted", context={"doc_key": doc_key})

    return _serialize_document(doc)


# ── Architecture Decision Records (ADRs) ────────────────────────────────

@router.get("/{project_id}/architecture/decisions")
def list_decisions(project_id: str, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    decisions = (
        db.query(ArchitectureDecision)
        .filter(ArchitectureDecision.project_id == project_id)
        .order_by(ArchitectureDecision.created_at)
        .all()
    )
    return [_serialize_decision(d) for d in decisions]


@router.post("/{project_id}/architecture/decisions")
def create_decision(project_id: str, body: DecisionCreate, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    decision = ArchitectureDecision(
        project_id=project_id,
        title=body.title,
        context=body.context,
        options_considered=body.options_considered,
        decision=body.decision,
        consequences=body.consequences,
        status=body.status,
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)
    log_audit(db, project_id=project_id, actor="consultant", action="architecture_decision_logged",
              context={"title": body.title, "status": body.status})
    return _serialize_decision(decision)


@router.patch("/{project_id}/architecture/decisions/{decision_id}")
def update_decision(project_id: str, decision_id: str, body: DecisionUpdate, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    decision = (
        db.query(ArchitectureDecision)
        .filter(ArchitectureDecision.id == decision_id, ArchitectureDecision.project_id == project_id)
        .first()
    )
    if not decision:
        raise HTTPException(404, "Decision not found")

    for key, value in body.model_dump(exclude_none=True).items():
        setattr(decision, key, value)
    db.commit()
    db.refresh(decision)
    return _serialize_decision(decision)


@router.delete("/{project_id}/architecture/decisions/{decision_id}")
def delete_decision(project_id: str, decision_id: str, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    decision = (
        db.query(ArchitectureDecision)
        .filter(ArchitectureDecision.id == decision_id, ArchitectureDecision.project_id == project_id)
        .first()
    )
    if not decision:
        raise HTTPException(404, "Decision not found")
    db.delete(decision)
    db.commit()
    return {"status": "deleted"}


# ── Readiness ────────────────────────────────────────────────────────────

@router.get("/{project_id}/architecture/readiness")
def get_readiness(project_id: str, db: Session = Depends(get_db)):
    """
    Summarizes whether Phase A is ready for the architecture_gate sign-off:
    tier chosen, how many docs are in each status, and which ones are still
    blocking. The frontend surfaces this before allowing "Review & Approve".
    """
    project = _get_project(db, project_id)
    return _readiness(db, project)

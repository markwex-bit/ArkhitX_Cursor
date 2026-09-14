from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.project import Project
from app.models.pipeline_event import PipelineEvent
from app.services.audit_service import log_audit

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    client_name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    pain_points: dict | None = None
    signals: dict | None = None
    ontology_schema: dict | None = None
    field_mappings: dict | None = None
    validation_results: dict | None = None


class GateDecision(BaseModel):
    approved: bool
    reviewer: str = "consultant"
    notes: str | None = None
    modifications: dict | None = None
    # Open issues to track even on approval (e.g. "approved with conditions").
    # Approval still advances the phase — conditions are logged for follow-up,
    # never silently dropped.
    conditions: list[str] | None = None


# Phase -1 = Architecture & Design (Phase A) — the pre-build gate. See
# app/api/architecture.py for document/ADR management within this phase.
# Phases -1 through 5 mirror the Playbook (see framework/docs/README.md).
# Filename prefix matches phase number (0A, 00–05).
PHASE_NAMES = {
    -1: "architecture", 0: "kickoff", 1: "ontology_design",
    2: "graph_population", 3: "agent_build", 4: "solution_validation", 5: "delivery",
}
GATE_NAMES = {
    -1: "architecture_gate", 0: "signal_gate", 1: "schema_gate",
    2: "mapping_gate", 3: "agent_gate", 4: "validation_gate",
}


@router.get("/")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_serialize(p) for p in projects]


@router.post("/")
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(name=data.name, client_name=data.client_name, description=data.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    log_audit(db, project_id=str(project.id), actor="consultant",
              action="project_created", context=data.model_dump())
    return _serialize(project)


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return _serialize(project)


@router.patch("/{project_id}")
def update_project(project_id: str, data: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return _serialize(project)


@router.post("/{project_id}/gates/{gate_name}/decide")
def decide_gate(project_id: str, gate_name: str, decision: GateDecision, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    expected_gate = GATE_NAMES.get(project.current_phase)
    if expected_gate and gate_name != expected_gate:
        raise HTTPException(400, f"Expected gate '{expected_gate}' for phase {project.current_phase}")

    approved_with_conditions = bool(decision.approved and decision.conditions)
    action = f"gate_{'approved' if decision.approved else 'rejected'}:{gate_name}"
    log_audit(db, project_id=project_id, actor=decision.reviewer,
              action=action, context={
                  "notes": decision.notes,
                  "modifications": decision.modifications,
                  "conditions": decision.conditions,
                  "approved_with_conditions": approved_with_conditions,
              })

    event = PipelineEvent(
        project_id=project.id,
        phase=project.current_phase,
        step_name=f"gate_{'passed' if decision.approved else 'rejected'}:{gate_name}",
        status="completed" if decision.approved else "rejected",
    )
    db.add(event)

    if decision.approved and project.current_phase < 5:
        old_phase = project.current_phase
        project.current_phase += 1
        project.phase_status = "in_progress"
        if project.current_phase == 5:
            project.phase_status = "completed"
        log_audit(db, project_id=project_id, actor="system",
                  action=f"phase_advanced:{old_phase}:{project.current_phase}")

    db.commit()
    db.refresh(project)
    return {
        "status": "approved" if decision.approved else "rejected",
        "approved_with_conditions": approved_with_conditions,
        "conditions": decision.conditions or [],
        "current_phase": project.current_phase,
        "phase_name": PHASE_NAMES.get(project.current_phase, "unknown"),
    }


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()
    return {"status": "deleted"}


def _serialize(project: Project) -> dict:
    return {
        "id": str(project.id),
        "name": project.name,
        "client_name": project.client_name,
        "description": project.description,
        "current_phase": project.current_phase,
        "phase_name": PHASE_NAMES.get(project.current_phase, "unknown"),
        "phase_status": project.phase_status,
        "architecture_tier": project.architecture_tier,
        "architecture_review_mode": project.architecture_review_mode,
        "pain_points": project.pain_points or {},
        "signals": project.signals or {},
        "ontology_schema": project.ontology_schema or {},
        "field_mappings": project.field_mappings or {},
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }

"""Playbook lineage chain for Governance Lineage tab."""
import os
from pathlib import Path
from sqlalchemy.orm import Session
from app.models.project import Project
from app.models.architecture_document import ArchitectureDocument
from app.models.architecture_decision import ArchitectureDecision
from app.models.audit_log import AuditLog
from app.models.grounding_record import GroundingRecord
from app.models.llm_usage_log import LlmUsageLog
from app.services.solution_scope import is_solution_audit_log, is_solution_llm_usage
from app.services.pipeline_timeline_service import build_pipeline_overview
from sqlalchemy import func


def _resolve_workspace_root() -> Path:
    """Repo root locally; /workspace in Docker (see infrastructure/docker-compose.yml)."""
    if env := os.getenv("WORKSPACE_ROOT"):
        return Path(env)
    docker_root = Path("/workspace")
    if (docker_root / "projects").is_dir():
        return docker_root
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "projects.json").is_file() and (parent / "projects").is_dir():
            return parent
    # Local fallback: .../ArkhitX_Cursor/framework/backend/app/services
    return here.parents[4] if len(here.parents) > 4 else here.parents[2]


WORKSPACE_ROOT = _resolve_workspace_root()


def build_project_lineage(db: Session, project: Project) -> dict:
    docs = db.query(ArchitectureDocument).filter(
        ArchitectureDocument.project_id == project.id
    ).all()
    decisions = db.query(ArchitectureDecision).filter(
        ArchitectureDecision.project_id == project.id
    ).all()
    audit_count = db.query(func.count(AuditLog.id)).filter(
        AuditLog.project_id == project.id
    ).scalar() or 0
    grounding_avg = db.query(func.avg(GroundingRecord.grounding_score)).filter(
        GroundingRecord.project_id == project.id
    ).scalar()
    llm_stats = db.query(
        func.count(LlmUsageLog.id),
        func.coalesce(func.sum(LlmUsageLog.input_tokens), 0),
        func.coalesce(func.sum(LlmUsageLog.output_tokens), 0),
    ).filter(LlmUsageLog.project_id == project.id).first()

    slug = (project.metadata_ or {}).get("application_slug")
    ontology_path = None
    seed_path = None
    if slug:
        ontology_path = WORKSPACE_ROOT / "projects" / slug / "ontology" / f"{slug}.json"
        seed_path = WORKSPACE_ROOT / "projects" / slug / "governance" / "seed_data.json"

    strategy = project.retrieval_strategy or {}
    default_strategy = strategy.get("default", "hybrid")

    return {
        "project": {
            "id": str(project.id),
            "name": project.name,
            "client_name": project.client_name,
            "current_phase": project.current_phase,
            "phase_status": project.phase_status,
        },
        "intake": {
            "description": project.description,
            "pain_points": project.pain_points or {},
            "signals": project.signals or {},
        },
        "architecture": {
            "tier": project.architecture_tier,
            "documents_total": len(docs),
            "documents_approved": sum(1 for d in docs if d.status == "approved"),
            "decisions_count": len(decisions),
            "documents": [
                {"doc_key": d.doc_key, "title": d.title, "status": d.status}
                for d in docs
            ],
            "decisions": [
                {"title": d.title, "status": d.status}
                for d in decisions
            ],
        },
        "ontology": {
            "path": str(ontology_path) if ontology_path else None,
            "on_disk": bool(ontology_path and ontology_path.exists()),
            "schema_keys": list((project.ontology_schema or {}).keys()),
        },
        "graph": {
            "seed_path": str(seed_path) if seed_path else None,
            "seed_on_disk": bool(seed_path and seed_path.exists()),
        },
        "retrieval_strategy": {
            "default": default_strategy,
            "agents": strategy.get("agents") or {},
        },
        "governance": {
            "audit_count": audit_count,
            "grounding_avg": float(grounding_avg) if grounding_avg is not None else None,
            "llm_calls": llm_stats[0] if llm_stats else 0,
            "total_tokens": int((llm_stats[1] or 0) + (llm_stats[2] or 0)) if llm_stats else 0,
        },
        "solution_pipeline": {
            "summary": pipeline_overview.get("summary") or {},
            "stages": [
                {
                    "stage": s.get("stage"),
                    "done": s.get("done"),
                    "total": s.get("total"),
                    "tokens": s.get("tokens"),
                }
                for s in solution_stages
            ],
        },
    }

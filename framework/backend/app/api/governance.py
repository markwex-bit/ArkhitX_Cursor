from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.audit_service import get_audit_logs
from app.services.grounding_service import get_grounding_records, get_grounding_summary
from app.services.prompt_service import list_prompts, get_prompt, upsert_prompt
from app.models.pipeline_event import PipelineEvent

router = APIRouter()


class PromptUpdate(BaseModel):
    agent_name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None


@router.get("/audit-logs")
def api_audit_logs(project_id: str = None, action: str = None,
                   limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    logs = get_audit_logs(db, project_id=project_id, action=action, limit=limit, offset=offset)
    return [
        {
            "id": str(log.id),
            "project_id": str(log.project_id) if log.project_id else None,
            "actor": log.actor,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "context": log.context,
            "result": log.result,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


@router.get("/grounding")
def api_grounding_records(project_id: str = None, agent_name: str = None,
                          limit: int = 100, db: Session = Depends(get_db)):
    records = get_grounding_records(db, project_id=project_id, agent_name=agent_name, limit=limit)
    return [
        {
            "id": str(r.id),
            "project_id": str(r.project_id) if r.project_id else None,
            "agent_name": r.agent_name,
            "grounding_score": r.grounding_score,
            "node_count": r.node_count,
            "query_path": r.query_path,
            "cited_nodes": r.cited_nodes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


@router.get("/grounding/summary/{project_id}")
def api_grounding_summary(project_id: str, db: Session = Depends(get_db)):
    return get_grounding_summary(db, project_id)


@router.get("/pipeline-events")
def api_pipeline_events(project_id: str = None, limit: int = 100, db: Session = Depends(get_db)):
    query = db.query(PipelineEvent)
    if project_id:
        query = query.filter(PipelineEvent.project_id == project_id)
    events = query.order_by(PipelineEvent.created_at.desc()).limit(limit).all()
    return [
        {
            "id": str(e.id),
            "project_id": str(e.project_id) if e.project_id else None,
            "phase": e.phase,
            "step_name": e.step_name,
            "status": e.status,
            "duration_ms": e.duration_ms,
            "error_message": e.error_message,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]


@router.get("/prompts")
def api_list_prompts(db: Session = Depends(get_db)):
    prompts = list_prompts(db)
    return [
        {
            "id": p.id,
            "agent_name": p.agent_name,
            "description": p.description,
            "model": p.model,
            "max_tokens": p.max_tokens,
            "temperature": p.temperature,
            "system_prompt": p.system_prompt,
            "application_slug": p.application_slug,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in prompts
    ]


@router.get("/prompts/{prompt_id}")
def api_get_prompt(prompt_id: str, db: Session = Depends(get_db)):
    prompt = get_prompt(db, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt not found")
    return {
        "id": prompt.id,
        "agent_name": prompt.agent_name,
        "description": prompt.description,
        "model": prompt.model,
        "max_tokens": prompt.max_tokens,
        "temperature": prompt.temperature,
        "system_prompt": prompt.system_prompt,
        "application_slug": prompt.application_slug,
        "updated_at": prompt.updated_at.isoformat() if prompt.updated_at else None,
    }


@router.put("/prompts/{prompt_id}")
def api_update_prompt(prompt_id: str, data: PromptUpdate, db: Session = Depends(get_db)):
    prompt = upsert_prompt(db, prompt_id, data.model_dump(exclude_none=True))
    return {"id": prompt.id, "agent_name": prompt.agent_name, "status": "updated"}

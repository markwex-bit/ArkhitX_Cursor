"""Merge pipeline_events + audit_logs into a unified per-project timeline for the dashboard."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session

from app.models.pipeline_event import PipelineEvent
from app.services.audit_service import get_audit_logs
from app.services.solution_scope import is_solution_audit_log, is_solution_pipeline_event


def _agent_code(actor_or_agent: str | None) -> str:
    if not actor_or_agent:
        return "—"
    raw = actor_or_agent.replace("agent:", "").strip()
    parts = raw.replace("_", "-").split("-")
    if len(parts) >= 2:
        return "".join(p[0].upper() for p in parts[:3] if p)[:4] or raw[:4].upper()
    return raw[:4].upper()


def _step_key(row: dict) -> str:
    return "|".join([
        str(row.get("stage", "")),
        str(row.get("process_group") or ""),
        str(row.get("step_name", "")),
        str(row.get("agent_name", "")),
    ])


def _infer_step_type(action: str, context: dict) -> str:
    if context.get("step_type"):
        return str(context["step_type"])
    if action == "llm_call":
        return "LLM"
    if action.startswith("gate_"):
        return "Gate + HITL"
    if action.startswith("phase_"):
        return "System"
    if "upload" in action or "file" in action:
        return "File I/O"
    if "consultant" in action or action.startswith("architecture"):
        return "Manual"
    return "System"


def _output_text_from_audit(result: dict, context: dict) -> str:
    preview = result.get("response_preview") or result.get("message") or result.get("summary")
    if preview:
        return str(preview)[:200]
    notes = context.get("notes")
    if notes:
        return str(notes)[:200]
    if result.get("error"):
        return str(result["error"])[:200]
    return ""


def _confidence_from_row(grounding, inp: dict, out: dict) -> float | None:
    if out.get("confidence") is not None:
        return float(out["confidence"])
    if inp.get("confidence") is not None:
        return float(inp["confidence"])
    if grounding is not None:
        return float(grounding)
    return None


def _map_pipeline_event(event: PipelineEvent, index: int) -> dict:
    inp = event.input_summary or {}
    out = event.output_summary or {}
    stage = inp.get("stage") or out.get("stage") or f"Phase {event.phase}"
    process_group = inp.get("process_group") or out.get("process_group") or ""
    agent = inp.get("agent") or out.get("agent") or event.step_name
    step_type = inp.get("step_type") or out.get("step_type") or "Pipeline"
    tokens_in = out.get("input_tokens") or inp.get("input_tokens")
    tokens_out = out.get("output_tokens") or inp.get("output_tokens")
    grounding = out.get("grounding_score") if out.get("grounding_score") is not None else inp.get("grounding_score")
    output_summary = out.get("summary") or out.get("response_preview") or out.get("message") or ""
    confidence = _confidence_from_row(grounding, inp, out)

    status = event.status or "completed"
    if event.error_message and status == "completed":
        status = "failed"

    tokens_total = None
    if tokens_in is not None or tokens_out is not None:
        tokens_total = int(tokens_in or 0) + int(tokens_out or 0)

    return {
        "id": f"pe-{event.id}",
        "source": "pipeline",
        "stage": str(stage),
        "process_group": str(process_group) if process_group else "",
        "agent": _agent_code(str(agent)),
        "agent_name": str(agent),
        "step_index": inp.get("step_index", index + 1),
        "step_name": event.step_name,
        "step_type": str(step_type),
        "status": status,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_total": tokens_total,
        "output_summary": str(output_summary) if output_summary else "",
        "grounding_score": grounding,
        "confidence": confidence,
        "duration_ms": event.duration_ms,
        "error_message": event.error_message,
        "phase": event.phase,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


def _map_audit_log(log, index: int) -> dict:
    ctx = log.context or {}
    res = log.result or {}
    action = log.action or ""
    stage = ctx.get("stage") or (
        "Governance Gates" if "gate" in action else "Agent Activity" if action == "llm_call" else "System"
    )
    process_group = ctx.get("process_group") or ""
    step_name = ctx.get("step_name") or action.replace("_", " ")
    status = "failed" if res.get("error") or res.get("success") is False else "completed"
    if res.get("status") == "running":
        status = "running"

    tokens_in = ctx.get("input_tokens")
    tokens_out = ctx.get("output_tokens")
    grounding = ctx.get("grounding_score")
    confidence = _confidence_from_row(grounding, ctx, res)

    tokens_total = None
    if tokens_in is not None or tokens_out is not None:
        tokens_total = int(tokens_in or 0) + int(tokens_out or 0)

    return {
        "id": f"al-{log.id}",
        "source": "audit",
        "stage": str(stage),
        "process_group": str(process_group) if process_group else "",
        "agent": _agent_code(log.actor),
        "agent_name": log.actor,
        "step_index": ctx.get("step_index", index + 1),
        "step_name": step_name,
        "step_type": _infer_step_type(action, ctx),
        "status": status,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "tokens_total": tokens_total,
        "output_summary": _output_text_from_audit(res, ctx),
        "grounding_score": grounding,
        "confidence": confidence,
        "duration_ms": ctx.get("elapsed_ms"),
        "error_message": str(res.get("error")) if res.get("error") else None,
        "phase": ctx.get("phase"),
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "audit_id": str(log.id),
    }


def _attach_history(rows: list[dict]) -> None:
    by_key: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_key[_step_key(row)].append(row)

    for key, runs in by_key.items():
        runs.sort(key=lambda r: r.get("created_at") or "")
        for i, row in enumerate(runs):
            prior = runs[:i]
            row["history"] = [
                {
                    "id": h["id"],
                    "status": h["status"],
                    "tokens_total": h.get("tokens_total"),
                    "output_summary": h.get("output_summary"),
                    "confidence": h.get("confidence"),
                    "duration_ms": h.get("duration_ms"),
                    "created_at": h.get("created_at"),
                }
                for h in reversed(prior[-20:])
            ]
            row["run_count"] = len(runs)


def build_pipeline_overview(db: Session, project_id: str, limit: int = 2000) -> dict:
    """Return grouped pipeline timeline + summary stats for one project."""
    events = (
        db.query(PipelineEvent)
        .filter(PipelineEvent.project_id == project_id)
        .order_by(PipelineEvent.created_at.asc())
        .limit(limit)
        .all()
    )
    audits = get_audit_logs(db, project_id=project_id, limit=limit)

    linked_audit_ids: set[str] = set()
    for ev in events:
        out = ev.output_summary or {}
        inp = ev.input_summary or {}
        aid = out.get("audit_id") or inp.get("audit_id")
        if aid:
            linked_audit_ids.add(str(aid))

    rows: list[dict] = []
    for i, ev in enumerate(events):
        if not is_solution_pipeline_event(ev):
            continue
        rows.append(_map_pipeline_event(ev, i))

    audit_index = 0
    for log in reversed(audits):
        if str(log.id) in linked_audit_ids:
            continue
        if not is_solution_audit_log(log):
            continue
        rows.append(_map_audit_log(log, audit_index))
        audit_index += 1

    rows.sort(key=lambda r: r.get("created_at") or "")

    for i, row in enumerate(rows):
        row["step_index"] = i + 1

    _attach_history(rows)

    stages: dict[str, list[dict]] = {}
    for row in rows:
        stages.setdefault(row["stage"], []).append(row)

    stage_groups = []
    for stage_name, stage_rows in stages.items():
        done = sum(1 for r in stage_rows if r["status"] in ("completed", "rejected"))
        running = sum(1 for r in stage_rows if r["status"] == "running")
        failed = sum(1 for r in stage_rows if r["status"] == "failed")
        stage_tokens = sum(r.get("tokens_total") or 0 for r in stage_rows)
        stage_groups.append({
            "stage": stage_name,
            "rows": stage_rows,
            "done": done,
            "total": len(stage_rows),
            "running": running,
            "failed": failed,
            "tokens": stage_tokens,
        })

    total_tokens = sum(r.get("tokens_total") or 0 for r in rows)
    gate_steps = sum(1 for r in rows if r.get("step_type") == "Gate + HITL" and r["status"] == "completed")

    summary = {
        "total_steps": len(rows),
        "completed": sum(1 for r in rows if r["status"] == "completed"),
        "running": sum(1 for r in rows if r["status"] == "running"),
        "failed": sum(1 for r in rows if r["status"] == "failed"),
        "pending": sum(1 for r in rows if r["status"] in ("pending", "started")),
        "total_tokens": total_tokens,
        "stage_count": len(stage_groups),
        "gates_passed": gate_steps,
    }

    return {"summary": summary, "stages": stage_groups, "rows": rows}

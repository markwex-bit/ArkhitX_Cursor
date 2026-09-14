"""Scope governance views to monitored application runtime — not ArkhitX dashboard/playbook tooling."""

from __future__ import annotations

# Playbook phase gates (ArkhitX methodology) — not solution HITL.
PLAYBOOK_GATE_NAMES = frozenset({
    "architecture_gate",
    "signal_gate",
    "schema_gate",
    "mapping_gate",
    "agent_gate",
    "validation_gate",
})

SOLUTION_AGENT_IDS = frozenset({
    "semantic-match",
    "migration-advisor",
    "SemanticMatchAgent",
    "MigrationAdvisorAgent",
})

SOLUTION_STAGES = frozenset({
    "Data Ingestion",
    "Eligibility",
    "Qlik Quality",
    "Candidate Generation",
    "Semantic Match",
    "Migration Advisor",
    "HITL Sign-off",
    "Agent Activity",
})

FRAMEWORK_ACTION_PREFIXES = (
    "architecture_",
    "phase_",
    "prompt_",
    "retrieval_strategy_",
)

FRAMEWORK_ACTIONS = frozenset({
    "architecture_documents_reverse_engineered",
    "architecture_tier_selected",
})


def _norm(value: str | None) -> str:
    return (value or "").strip()


def is_playbook_gate(gate_name: str | None) -> bool:
    return _norm(gate_name) in PLAYBOOK_GATE_NAMES


def is_solution_gate(gate_name: str | None) -> bool:
    name = _norm(gate_name)
    if not name:
        return False
    if is_playbook_gate(name):
        return False
    return name.startswith("solution_") or name.endswith("_signoff") or "migration" in name.lower()


def is_framework_actor(actor: str | None) -> bool:
    a = _norm(actor).lower()
    if not a:
        return False
    if a.startswith("script:"):
        return True
    if a in {"dashboard", "arkhitx", "arkhitx-dashboard"}:
        return True
    return False


def is_framework_action(action: str | None) -> bool:
    a = _norm(action).lower()
    if not a:
        return False
    if a in FRAMEWORK_ACTIONS:
        return True
    return any(a.startswith(prefix) for prefix in FRAMEWORK_ACTION_PREFIXES)


def is_solution_agent(actor_or_agent: str | None) -> bool:
    raw = _norm(actor_or_agent)
    if not raw:
        return False
    if raw in SOLUTION_AGENT_IDS:
        return True
    if raw.startswith("agent:"):
        agent_id = raw.split(":", 1)[1]
        return agent_id in SOLUTION_AGENT_IDS
    return raw.endswith("Agent") and raw not in {"GovernedBaseAgent"}


def _context_scope(context: dict | None) -> str | None:
    if not context:
        return None
    scope = context.get("scope")
    return str(scope) if scope else None


def is_solution_audit_log(log) -> bool:
    ctx = log.context or {}
    scope = _context_scope(ctx)
    if scope == "solution":
        return True
    if scope == "framework":
        return False

    actor = log.actor
    action = _norm(log.action)

    if is_framework_actor(actor) or is_framework_action(action):
        return False

    if is_solution_agent(actor):
        return True
    if action == "llm_call" and is_solution_agent(actor):
        return True
    if action.startswith("signoff") or action.startswith("pipeline_"):
        return True
    if action.startswith("gate_"):
        gate_part = action.split(":", 1)[-1]
        return is_solution_gate(gate_part)

    stage = ctx.get("stage")
    if stage in SOLUTION_STAGES:
        return True

    if _norm(actor).lower() == "consultant" and action.startswith("gate_"):
        return False

    return False


def is_solution_pipeline_event(event) -> bool:
    inp = event.input_summary or {}
    out = event.output_summary or {}
    scope = _context_scope(inp) or _context_scope(out)
    if scope == "solution":
        return True
    if scope == "framework":
        return False

    stage = str(inp.get("stage") or out.get("stage") or "")
    agent = str(inp.get("agent") or out.get("agent") or "")
    step_name = _norm(event.step_name)

    if is_framework_actor(agent) or is_framework_actor(step_name):
        return False
    if "reverse_engineer" in step_name.lower() or "architecture document" in step_name.lower():
        return False
    if step_name.startswith("Gate:") and any(g.replace("_", " ") in step_name for g in PLAYBOOK_GATE_NAMES):
        return False

    if stage in SOLUTION_STAGES:
        return True
    if is_solution_agent(agent):
        return True
    if inp.get("step_type") == "LLM" and is_solution_agent(agent):
        return True

    return False


def is_solution_llm_usage(agent_name: str | None) -> bool:
    return is_solution_agent(agent_name)


def is_solution_grounding(agent_name: str | None) -> bool:
    return is_solution_agent(agent_name)

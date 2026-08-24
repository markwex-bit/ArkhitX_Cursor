"""
ArkhitX Agents API
==================

Endpoints that trigger ArkhitX's own internal LLM agents.
These agents are self-governed: they log to ArkhitX's own audit trail
and ground against the GovernanceRule / ProjectPhase nodes in Neo4j.

Endpoints:
  POST /api/agents/extract-ontology         — OntologyExtractorAgent
  POST /api/agents/detect-compliance        — ComplianceDetectorAgent
  POST /api/agents/generate-grounding-query — GroundingQueryGeneratorAgent
  POST /api/agents/build-grounding-query    — GroundingQueryBuilderAgent
  POST /api/agents/check-compliance         — ComplianceCheckerAgent
  POST /api/agents/validate-phase-gate      — PhaseGateValidatorAgent
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter()


@router.post("/extract-ontology")
def extract_ontology(body: dict, db: Session = Depends(get_db)):
    """
    Run the OntologyExtractorAgent against a project's source files.

    Reads the project's Python models, schemas, and agent files,
    then returns a proposed ontology JSON ready for review and saving.

    Body: { "slug": "contract-review" }
    """
    slug = (body.get("slug") or "").strip()
    if not slug:
        raise HTTPException(400, "slug is required")

    try:
        from app.agents.ontology_extractor import OntologyExtractorAgent
        agent = OntologyExtractorAgent(db)
        result = agent.run(slug)
        return {"status": "ok", "slug": slug, **result}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Agent error: {e}")


@router.post("/detect-compliance")
def detect_compliance(body: dict, db: Session = Depends(get_db)):
    """
    Run the ComplianceDetectorAgent against a project's agent files.

    Reads Python source files, checks each of the 7 GovernanceRules,
    and returns per-rule findings to pre-populate the Wiring Checklist.
    The human still reviews and signs off — this agent does the investigation.

    Body: { "slug": "contract-review" }
    """
    slug = (body.get("slug") or "").strip()
    if not slug:
        raise HTTPException(400, "slug is required")

    try:
        from app.agents.compliance_detector import ComplianceDetectorAgent
        agent = ComplianceDetectorAgent(db)
        result = agent.run(slug)
        return {"status": "ok", "slug": slug, **result}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Agent error: {e}")


@router.post("/generate-grounding-query")
def generate_grounding_query(body: dict, db: Session = Depends(get_db)):
    """
    Run the GroundingQueryGeneratorAgent to produce a _grounding_query() method.

    Takes the agent's name and a plain-English description of what it does,
    then returns Python code ready to paste into the agent class.

    Body: {
        "slug":          "contract-review",
        "agent_name":    "ContractReviewAgent",
        "agent_purpose": "Reviews contract text, extracts clauses, scores risk",
        "entity_types":  ["Clause", "RiskFactor"]   // optional
    }
    """
    slug         = (body.get("slug") or "").strip()
    agent_name   = (body.get("agent_name") or "").strip()
    agent_purpose = (body.get("agent_purpose") or "").strip()
    entity_types = body.get("entity_types") or []

    if not slug:
        raise HTTPException(400, "slug is required")
    if not agent_name:
        raise HTTPException(400, "agent_name is required")
    if not agent_purpose:
        raise HTTPException(400, "agent_purpose is required")

    try:
        from app.agents.grounding_query_generator import GroundingQueryGeneratorAgent
        agent = GroundingQueryGeneratorAgent(db)
        result = agent.run(slug, agent_name, agent_purpose, entity_types or None)
        return {"status": "ok", "slug": slug, "agent_name": agent_name, **result}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Agent error: {e}")


@router.post("/build-grounding-query")
def build_grounding_query(body: dict, db: Session = Depends(get_db)):
    """
    Run the GroundingQueryBuilderAgent to produce a targeted Cypher query.

    Given a plain-English task description, returns the Cypher query that
    retrieves only the relevant GovernanceRule nodes — not all 7 every time.
    Used internally by the ComplianceCheckerAgent and available standalone.

    Body: { "task_description": "Write a new agent that summarises contracts" }
    """
    task_description = (body.get("task_description") or "").strip()
    if not task_description:
        raise HTTPException(400, "task_description is required")

    try:
        from app.agents.grounding_query_builder import GroundingQueryBuilderAgent
        agent = GroundingQueryBuilderAgent(db)
        result = agent.run(task_description)
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(500, f"Agent error: {e}")


@router.post("/check-compliance")
def check_compliance(body: dict, db: Session = Depends(get_db)):
    """
    Run the ComplianceCheckerAgent on a proposed AI output.

    Real-time quality gate: checks whether a generated response violates
    any of the governance rules before it reaches the user.

    Body: {
        "proposed_output": "Here is the response the AI generated...",
        "task_context":    "The user asked the AI to write a new base agent class"  // optional
    }
    """
    proposed_output = (body.get("proposed_output") or "").strip()
    task_context    = (body.get("task_context") or "").strip()

    if not proposed_output:
        raise HTTPException(400, "proposed_output is required")

    try:
        from app.agents.compliance_checker import ComplianceCheckerAgent
        agent = ComplianceCheckerAgent(db)
        result = agent.run(proposed_output=proposed_output, task_context=task_context)
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(500, f"Agent error: {e}")


@router.post("/validate-phase-gate")
def validate_phase_gate(body: dict, db: Session = Depends(get_db)):
    """
    Run the PhaseGateValidatorAgent to check if a project can advance phases.

    Performs deterministic checks (files, DB rows, Neo4j nodes, audit events)
    and uses the LLM to produce a clear action plan if the gate is blocked.

    Body: {
        "slug":         "contract-review",
        "target_phase": 2    // 1, 2, or 3
    }
    """
    slug         = (body.get("slug") or "").strip()
    target_phase = body.get("target_phase")

    if not slug:
        raise HTTPException(400, "slug is required")
    if target_phase not in (1, 2, 3):
        raise HTTPException(400, "target_phase must be 1, 2, or 3")

    try:
        from app.agents.phase_gate_validator import PhaseGateValidatorAgent
        agent = PhaseGateValidatorAgent(db)
        result = agent.run(slug=slug, target_phase=int(target_phase))
        return {"status": "ok", "slug": slug, **result}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Agent error: {e}")

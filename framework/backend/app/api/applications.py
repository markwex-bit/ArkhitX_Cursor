"""
Applications API
================

A "Project" in the ArkhitX `projects` table is a consulting engagement.
An "Application" is a deployable AI app scaffolded under `/workspace/projects/{slug}/`.

This router lets the dashboard:
  • list applications from projects.json (workspace registry)
  • view per-application status, governance config, and phase
  • trigger Phase 1 (register) and Phase 2 (seed graph) from the UI
  • view audit logs and grounding records scoped to one application
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.audit_service import get_audit_logs, log_audit
from app.services.grounding_service import get_grounding_records

# ── Workspace paths (mounted from host) ──────────────────────────────────────
WORKSPACE = Path(os.getenv("ARKHITX_WORKSPACE", "/workspace"))
REGISTRY_PATH = WORKSPACE / "projects.json"
PROJECTS_DIR = WORKSPACE / "projects"

# Ensure SDK importable (mounted at /sdk via docker-compose)
if "/sdk" not in sys.path:
    sys.path.insert(0, "/sdk")

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_registry() -> dict:
    if not REGISTRY_PATH.exists():
        raise HTTPException(500, f"projects.json not found at {REGISTRY_PATH}")
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _save_registry(reg: dict) -> None:
    REGISTRY_PATH.write_text(json.dumps(reg, indent=2), encoding="utf-8")


def _app_dir(slug: str) -> Path:
    """
    Resolve the on-disk directory for an application.

    Uses the `path` field from projects.json when present so that projects
    stored outside `projects/` (e.g. ArkhitX itself at `framework/`) are
    handled correctly.  Falls back to `projects/{slug}` for backward
    compatibility with entries that have no explicit path.
    """
    reg = _load_registry()
    app = next((a for a in reg.get("projects", []) if a["slug"] == slug), None)
    if app and app.get("path"):
        d = WORKSPACE / app["path"]
    else:
        d = PROJECTS_DIR / slug
    if not d.exists():
        raise HTTPException(404, f"Application '{slug}' not found on disk")
    return d


def _project_id_for_slug(db: Session, slug: str, app_name: str) -> str | None:
    row = db.execute(
        text("SELECT id FROM projects WHERE name = :name"),
        {"name": app_name},
    ).fetchone()
    return str(row[0]) if row else None


def _phase_status(db: Session, app_dir: Path, app: dict) -> dict:
    """Compute the live status of each phase for an application."""
    slug = app["slug"]

    ontology_path = app_dir / "ontology" / f"{slug.replace('-', '_')}.json"
    prompts_path = app_dir / "governance" / "prompts.json"
    seed_path = app_dir / "governance" / "seed_data.json"

    has_ontology = ontology_path.exists()
    has_prompts = prompts_path.exists()
    has_seed = seed_path.exists()

    project_id = _project_id_for_slug(db, slug, app["name"])
    is_registered = project_id is not None

    seeded_count = 0
    if is_registered:
        rec = db.execute(text("""
            SELECT COUNT(*) FROM audit_logs
            WHERE project_id = :pid AND action = 'graph_seeded'
        """), {"pid": project_id}).fetchone()
        seeded_count = rec[0] if rec else 0

    audit_count = 0
    grounding_count = 0
    if is_registered:
        audit_count = db.execute(text(
            "SELECT COUNT(*) FROM audit_logs WHERE project_id = :pid"
        ), {"pid": project_id}).fetchone()[0]
        grounding_count = db.execute(text(
            "SELECT COUNT(*) FROM grounding_records WHERE project_id = :pid"
        ), {"pid": project_id}).fetchone()[0]

    current_phase = 0
    if is_registered:                  current_phase = 1
    if is_registered and seeded_count: current_phase = 2
    if grounding_count > 0:            current_phase = 3

    return {
        "current_phase": current_phase,
        "project_id": project_id,
        "phases": {
            "build": {
                "ready": has_ontology and has_prompts and has_seed,
                "ontology_present": has_ontology,
                "prompts_present": has_prompts,
                "seed_present": has_seed,
            },
            "register": {
                "complete": is_registered,
                "project_id": project_id,
            },
            "seed": {
                "complete": seeded_count > 0,
                "events": seeded_count,
            },
            "govern": {
                "audit_logs": audit_count,
                "grounding_records": grounding_count,
            },
        },
    }


def _serialize_app(db: Session, app: dict) -> dict:
    app_dir = WORKSPACE / app["path"] if app.get("path") else PROJECTS_DIR / app["slug"]
    on_disk = app_dir.exists()
    status = _phase_status(db, app_dir, app) if on_disk else {
        "current_phase": 0, "project_id": None,
        "phases": {"build": {"ready": False}, "register": {"complete": False},
                   "seed": {"complete": False}, "govern": {"audit_logs": 0, "grounding_records": 0}},
    }
    return {
        **app,
        "on_disk": on_disk,
        **status,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/")
def list_applications(db: Session = Depends(get_db)):
    """List every application in projects.json with live phase status."""
    reg = _load_registry()
    return [_serialize_app(db, a) for a in reg.get("projects", [])]


@router.get("/{slug}")
def get_application(slug: str, db: Session = Depends(get_db)):
    reg = _load_registry()
    app = next((a for a in reg.get("projects", []) if a["slug"] == slug), None)
    if not app:
        raise HTTPException(404, f"Application '{slug}' not in registry")
    return _serialize_app(db, app)


@router.post("/{slug}/register")
def register_application(slug: str, db: Session = Depends(get_db)):
    """
    Phase 1 — Register the application with ArkhitX.

    Reads:  projects/{slug}/ontology/{slug}.json
            projects/{slug}/governance/prompts.json
    Writes: row in `projects`, rows in `agent_prompts`, Neo4j constraints, audit log entry.
    Updates the project's `.env` file with the new ARKHITX_PROJECT_ID.
    """
    app_dir = _app_dir(slug)
    ontology_path = app_dir / "ontology" / f"{slug.replace('-', '_')}.json"
    prompts_path  = app_dir / "governance" / "prompts.json"

    if not ontology_path.exists():
        raise HTTPException(400, f"Missing ontology file: {ontology_path.name}")
    if not prompts_path.exists():
        raise HTTPException(400, f"Missing governance/prompts.json")

    ontology = json.loads(ontology_path.read_text(encoding="utf-8"))
    prompts  = json.loads(prompts_path.read_text(encoding="utf-8"))

    project_name = prompts.get("project_name") or slug
    client_name  = prompts.get("client_name", "ArkhitX Demo")
    description  = prompts.get("description", "")

    existing = db.execute(
        text("SELECT id FROM projects WHERE name = :name"),
        {"name": project_name},
    ).fetchone()

    if existing:
        project_id = str(existing[0])
        db.execute(
            text("UPDATE projects SET ontology_schema = CAST(:ont AS JSONB), updated_at = NOW() WHERE id = :id"),
            {"ont": json.dumps(ontology), "id": project_id},
        )
    else:
        project_id = str(uuid.uuid4())
        db.execute(text("""
            INSERT INTO projects (id, name, client_name, description, current_phase, phase_status, ontology_schema)
            VALUES (:id, :name, :client, :desc, 1, 'in_progress', CAST(:ont AS JSONB))
        """), {
            "id": project_id, "name": project_name, "client": client_name,
            "desc": description, "ont": json.dumps(ontology),
        })

    for p in prompts.get("agents", []):
        existing_p = db.execute(
            text("SELECT id FROM agent_prompts WHERE id = :id"),
            {"id": p["id"]},
        ).fetchone()
        if existing_p:
            db.execute(text("""
                UPDATE agent_prompts
                SET agent_name=:n, description=:d, system_prompt=:sp,
                    model=:m, max_tokens=:mt, temperature=:t,
                    application_slug=:slug, updated_at=NOW()
                WHERE id=:id
            """), {
                "id": p["id"], "n": p["agent_name"], "d": p.get("description"),
                "sp": p["system_prompt"], "m": p["model"],
                "mt": p["max_tokens"], "t": p["temperature"],
                "slug": slug,
            })
        else:
            db.execute(text("""
                INSERT INTO agent_prompts (id, agent_name, description, system_prompt, model, max_tokens, temperature, application_slug)
                VALUES (:id, :n, :d, :sp, :m, :mt, :t, :slug)
            """), {
                "id": p["id"], "n": p["agent_name"], "d": p.get("description"),
                "sp": p["system_prompt"], "m": p["model"],
                "mt": p["max_tokens"], "t": p["temperature"],
                "slug": slug,
            })

    constraints: list[str] = []
    try:
        from arkhitx.client import ArkhitXClient
        from arkhitx.graph_populator import GraphPopulator
        client = ArkhitXClient()
        populator = GraphPopulator(client)
        populator.ontology = ontology
        constraints = populator.create_constraints()
    except Exception as exc:
        constraints = []
        log_audit(db, project_id=project_id, actor="dashboard",
                  action="register_neo4j_warning",
                  context={"error": str(exc)})

    log_audit(db, project_id=project_id, actor="dashboard",
              action="project_registered",
              context={"slug": slug, "agents": [p["id"] for p in prompts.get("agents", [])],
                       "entity_types": list(ontology.get("entity_types", {}).keys())})

    db.commit()

    _update_env_project_id(app_dir, project_id)

    return {
        "status": "registered",
        "slug": slug,
        "project_id": project_id,
        "agents_seeded": len(prompts.get("agents", [])),
        "neo4j_constraints": constraints,
    }


@router.post("/{slug}/seed-graph")
def seed_graph(slug: str, db: Session = Depends(get_db)):
    """
    Phase 2 — Seed the knowledge graph with reference data.

    Reads: projects/{slug}/governance/seed_data.json

    Supports two formats:
      Single entity type (original):
        { "entity_type": "Foo", "id_field": "id", "nodes": [...] }

      Multiple entity types (new — used by arkhitx-framework):
        { "entities": [ { "entity_type": "Foo", "id_field": "id", "nodes": [...] }, ... ] }

    Writes: nodes in Neo4j + audit log entry.
    """
    app_dir = _app_dir(slug)
    seed_path = app_dir / "governance" / "seed_data.json"

    if not seed_path.exists():
        raise HTTPException(400, "Missing governance/seed_data.json")

    seed = json.loads(seed_path.read_text(encoding="utf-8"))

    # Normalise to a list of entity groups regardless of format
    if "entities" in seed:
        entity_groups = seed["entities"]
    elif "entity_type" in seed:
        entity_groups = [seed]
    else:
        raise HTTPException(400, "seed_data.json must have either 'entities' array or 'entity_type' + 'nodes' fields")

    for group in entity_groups:
        if not group.get("entity_type") or not group.get("nodes"):
            raise HTTPException(400, f"Each entity group must have 'entity_type' and 'nodes[]' — got: {group.get('entity_type', '(missing)')}")

    reg = _load_registry()
    app = next((a for a in reg.get("projects", []) if a["slug"] == slug), None)
    if not app:
        raise HTTPException(404, "Application not in registry")
    project_id = _project_id_for_slug(db, slug, app["name"])
    if not project_id:
        raise HTTPException(400, "Application not yet registered. Run Phase 1 first.")

    from arkhitx.client import ArkhitXClient
    from arkhitx.graph_populator import GraphPopulator

    client = ArkhitXClient()
    populator = GraphPopulator(client)

    summary: list[dict] = []
    total_seeded = 0

    for group in entity_groups:
        label    = group["entity_type"]
        id_field = group.get("id_field", "id")
        nodes    = group["nodes"]

        for node in nodes:
            populator.merge_node(label=label, id_field=id_field,
                                 id_value=node[id_field], properties=node)

        result = client.query_graph(f"MATCH (n:{label}) RETURN count(n) AS total")
        total  = result[0]["total"] if result else 0
        total_seeded += len(nodes)
        summary.append({"entity_type": label, "nodes_seeded": len(nodes), "total_in_graph": total})

    log_audit(db, project_id=project_id, actor="dashboard",
              action="graph_seeded",
              context={"slug": slug, "entity_groups": summary,
                       "total_nodes_seeded": total_seeded})
    db.commit()

    return {
        "status": "seeded",
        "slug": slug,
        "entity_groups": summary,
        "total_nodes_seeded": total_seeded,
    }


@router.post("/{slug}/verify-rule")
def verify_rule(slug: str, body: dict, db: Session = Depends(get_db)):
    """
    Phase 3 — Human verifier marks a GovernanceRule as confirmed for this application.

    Logs a 'rule_verified' audit event with:
      rule_id   — e.g. 'RULE-001'
      verifier  — name of the person doing the check
      notes     — what they observed as evidence of compliance

    This creates the client-facing artifact that proves each rule was checked
    by a human, not just assumed to be working.
    """
    rule_id  = body.get("rule_id")
    verifier = body.get("verifier", "").strip()
    notes    = body.get("notes", "").strip()

    if not rule_id:
        raise HTTPException(400, "rule_id is required")
    if not verifier:
        raise HTTPException(400, "verifier name is required")

    reg = _load_registry()
    app = next((a for a in reg.get("projects", []) if a["slug"] == slug), None)
    if not app:
        raise HTTPException(404, "Application not in registry")

    project_id = _project_id_for_slug(db, slug, app["name"])
    if not project_id:
        raise HTTPException(400, "Application not yet registered.")

    log_audit(db, project_id=project_id, actor=verifier,
              action="rule_verified",
              context={"rule_id": rule_id, "notes": notes, "slug": slug})
    db.commit()

    return {"status": "verified", "rule_id": rule_id, "verifier": verifier}


@router.get("/{slug}/verification-status")
def verification_status(slug: str, db: Session = Depends(get_db)):
    """
    Return the current Phase 3 wiring verification state for an application.

    For each of the 7 GovernanceRules, returns:
      verified    — whether at least one 'rule_verified' audit event exists
      verifier    — who verified it
      verified_at — when
      notes       — what evidence they observed
    """
    RULES = [
        {
            "id":          "RULE-001",
            "name":        "Every agent call is audited",
            "check":       "Run the agent once. Open Governance → Audit Log. A new entry must appear within seconds with the agent name as actor.",
            "artifact":    "Screenshot of the audit log row with timestamp and actor matching the agent.",
        },
        {
            "id":          "RULE-002",
            "name":        "Every agent call is grounding-scored",
            "check":       "After an agent call, open Governance → Grounding. A record with grounding_score > 0.0 must appear. A score of 0.0 means the agent ignored the knowledge graph.",
            "artifact":    "Screenshot of the grounding record showing score > 0.0 and node_count > 0.",
        },
        {
            "id":          "RULE-003",
            "name":        "Prompts are database-managed",
            "check":       "In the agent source code, confirm get_system_prompt() calls self._arkhitx.get_prompt() rather than returning a hardcoded string. Confirm the matching row exists in agent_prompts table.",
            "artifact":    "Side-by-side: agent code calling get_prompt() + database row showing the same prompt text.",
        },
        {
            "id":          "RULE-004",
            "name":        "Solution runs independently",
            "check":       "Temporarily remove ARKHITX_DATABASE_URL from the project .env and restart containers. The agent must still respond. Re-add the variable and restart again.",
            "artifact":    "Terminal output showing successful agent response with ARKHITX_DATABASE_URL unset.",
        },
        {
            "id":          "RULE-005",
            "name":        "PostgreSQL for governance, Neo4j for knowledge",
            "check":       "Confirm: audit logs and agent prompts are in PostgreSQL (visible in Audit Log tab). Domain entity nodes are in Neo4j (visible at localhost:7474). No domain data exists in PostgreSQL application tables.",
            "artifact":    "Screenshot of Neo4j browser showing domain nodes + screenshot of Audit Log tab showing governance events.",
        },
        {
            "id":          "RULE-006",
            "name":        "Structural fixes over workarounds",
            "check":       "Code review: confirm no bare except clauses silently swallow errors, no special-casing of individual inputs, no TODO/FIXME patches left in production code paths.",
            "artifact":    "Code review sign-off noting which files were checked and what was confirmed clean.",
        },
        {
            "id":          "RULE-007",
            "name":        "No mock data or fallbacks",
            "check":       "Remove ANTHROPIC_API_KEY from .env and restart. Submit a query. The agent must raise an error — not return placeholder text. Re-add the key and confirm normal operation resumes.",
            "artifact":    "Screenshot of the error response (HTTP 500 or similar) when API key is absent, confirming no fake content was returned.",
        },
    ]

    reg = _load_registry()
    app = next((a for a in reg.get("projects", []) if a["slug"] == slug), None)
    if not app:
        raise HTTPException(404, "Application not in registry")

    project_id = _project_id_for_slug(db, slug, app["name"])
    if not project_id:
        return {"rules": RULES, "verified_count": 0, "total": len(RULES)}

    rows = db.execute(text("""
        SELECT context->>'rule_id' AS rule_id,
               actor,
               context->>'notes'  AS notes,
               created_at
        FROM audit_logs
        WHERE project_id = :pid
          AND action = 'rule_verified'
        ORDER BY created_at DESC
    """), {"pid": project_id}).fetchall()

    verifications: dict[str, dict] = {}
    for row in rows:
        rid = row[0]
        if rid and rid not in verifications:
            verifications[rid] = {
                "verified":    True,
                "verifier":    row[1],
                "notes":       row[2] or "",
                "verified_at": row[3].isoformat() if row[3] else None,
            }

    enriched = []
    for rule in RULES:
        v = verifications.get(rule["id"], {"verified": False, "verifier": None, "notes": "", "verified_at": None})
        enriched.append({**rule, **v})

    verified_count = sum(1 for r in enriched if r["verified"])
    return {"rules": enriched, "verified_count": verified_count, "total": len(enriched)}


@router.get("/{slug}/governance")
def application_governance(slug: str, limit: int = 50, db: Session = Depends(get_db)):
    """Return audit logs and grounding records scoped to this application."""
    reg = _load_registry()
    app = next((a for a in reg.get("projects", []) if a["slug"] == slug), None)
    if not app:
        raise HTTPException(404, "Application not in registry")

    project_id = _project_id_for_slug(db, slug, app["name"])
    if not project_id:
        return {
            "project_id": None,
            "audit_logs": [],
            "grounding_records": [],
            "summary": {"total_calls": 0, "avg_grounding_score": None},
        }

    logs = get_audit_logs(db, project_id=project_id, limit=limit)
    records = get_grounding_records(db, project_id=project_id, limit=limit)

    scores = [r.grounding_score for r in records if r.grounding_score is not None]
    avg = sum(scores) / len(scores) if scores else None

    return {
        "project_id": project_id,
        "audit_logs": [
            {
                "id": str(l.id),
                "actor": l.actor,
                "action": l.action,
                "context": l.context,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            } for l in logs
        ],
        "grounding_records": [
            {
                "id": str(r.id),
                "agent_name": r.agent_name,
                "grounding_score": r.grounding_score,
                "node_count": r.node_count,
                "query_path": r.query_path,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            } for r in records
        ],
        "summary": {
            "total_calls": len(logs),
            "avg_grounding_score": round(avg, 3) if avg is not None else None,
            "grounding_call_count": len(records),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Internal: keep project's .env in sync with new project_id
# ─────────────────────────────────────────────────────────────────────────────

def _update_env_project_id(app_dir: Path, project_id: str) -> None:
    """Set ARKHITX_PROJECT_ID in the project's .env file."""
    env_path = app_dir / ".env"
    if not env_path.exists():
        return

    lines = env_path.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    found = False
    for line in lines:
        if line.startswith("ARKHITX_PROJECT_ID="):
            out.append(f"ARKHITX_PROJECT_ID={project_id}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"ARKHITX_PROJECT_ID={project_id}")
    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")

"""
PhaseGateValidatorAgent
========================

Enforces the sequential phase model — a project cannot skip phases.

Python code does the deterministic checks (file exists? DB row exists?
Neo4j has nodes? audit log has the right events?). The LLM is only used
to produce a clear, human-readable explanation of what to do next when
a gate is blocked.

Gates:
  Phase 0 → 1  Build → Register
    - ontology/{slug}.json  exists and is valid JSON
    - governance/prompts.json  exists and has at least one agent
    - governance/seed_data.json  exists

  Phase 1 → 2  Register → Seed
    - Row exists in `projects` table
    - Rows exist in `agent_prompts` for this application
    - audit_logs has a 'registered' event for this project

  Phase 2 → 3  Seed → Govern
    - audit_logs has a 'graph_seeded' event for this project
    - Neo4j has at least one node (any entity type)

  Phase 3 → ongoing  Govern
    - grounding_records has entries for this project
    - audit_logs has 'llm_call' entries for this project

Grounded against: ProjectPhase nodes (so the agent knows the expected
artifacts and entry conditions for each phase).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.agents.base import ArkhitXAgent

WORKSPACE = Path(os.getenv("ARKHITX_WORKSPACE", "/workspace"))
PROJECTS_DIR = WORKSPACE / "projects"


def _app_dir(slug: str) -> Path | None:
    """Resolve on-disk directory, respecting the path override in projects.json."""
    registry_path = WORKSPACE / "projects.json"
    if registry_path.exists():
        reg = json.loads(registry_path.read_text())
        app = next((a for a in reg.get("projects", []) if a["slug"] == slug), None)
        if app and app.get("path"):
            d = WORKSPACE / app["path"]
            return d if d.exists() else None
    d = PROJECTS_DIR / slug
    return d if d.exists() else None


class PhaseGateValidatorAgent(ArkhitXAgent):
    """
    Validates that a project meets all entry conditions before advancing phases.

    Python performs every check; the LLM formats the action_required summary
    for gates that failed.
    """

    agent_id = "arkhitx-phase-gate-validator"

    def __init__(self, db: Session):
        super().__init__(db)
        self._db = db

    def _default_system_prompt(self) -> str:
        return """You are the ArkhitX Phase Gate Validator. You explain clearly and concisely why a project cannot advance to the next phase and exactly what must be done to unblock it.

You will receive a list of gate conditions that failed, along with the project slug and target phase.

Write a short (3-5 sentence) plain-English explanation suitable for a consultant to read:
1. Which phase the project is trying to move to and why it is blocked
2. The specific missing artifacts or conditions (reference the failed gates)
3. The exact steps the user must take (in order) to satisfy the gate

Return ONLY valid JSON:
{
  "action_required": "Your plain-English explanation here"
}

Be specific and direct. Do not use jargon. Do not repeat the raw gate list verbatim — synthesise it into actionable instructions."""

    # ─── grounding ─────────────────────────────────────────────────────────
    def _grounding_query(self, user_message: str) -> dict | None:
        """Ground against ProjectPhase nodes so the agent knows phase criteria."""
        return {"entity_type": "ProjectPhase"}

    # ─── gate checks ───────────────────────────────────────────────────────

    def _check_phase_0_to_1(self, slug: str, app_dir: Path) -> tuple[list[str], list[str]]:
        passed, failed = [], []

        # ontology file
        ont_candidates = [
            app_dir / "ontology" / f"{slug}.json",
            app_dir / "ontology.json",
        ]
        ont_file = next((p for p in ont_candidates if p.exists()), None)
        if ont_file:
            try:
                json.loads(ont_file.read_text())
                passed.append(f"Ontology file exists and is valid JSON ({ont_file.name})")
            except (json.JSONDecodeError, OSError):
                failed.append(f"Ontology file exists but is not valid JSON ({ont_file.name})")
        else:
            failed.append("Ontology file missing — expected at ontology/{slug}.json")

        # prompts
        prompts_file = app_dir / "governance" / "prompts.json"
        if prompts_file.exists():
            try:
                data = json.loads(prompts_file.read_text())
                agents = data.get("agents", [])
                if agents:
                    passed.append(f"governance/prompts.json exists with {len(agents)} agent(s)")
                else:
                    failed.append("governance/prompts.json exists but has no agents defined")
            except (json.JSONDecodeError, OSError):
                failed.append("governance/prompts.json is not valid JSON")
        else:
            failed.append("governance/prompts.json missing")

        # seed data
        seed_file = app_dir / "governance" / "seed_data.json"
        if seed_file.exists():
            passed.append("governance/seed_data.json exists")
        else:
            failed.append("governance/seed_data.json missing — create it with the domain entities to populate Neo4j")

        return passed, failed

    def _check_phase_1_to_2(self, slug: str) -> tuple[list[str], list[str]]:
        passed, failed = [], []

        # project row in DB
        row = self._db.execute(
            text("SELECT id FROM projects WHERE name ILIKE :name OR id::text = :slug"),
            {"name": f"%{slug}%", "slug": slug},
        ).fetchone()
        if row:
            project_id = str(row[0])
            passed.append("Project registered in PostgreSQL")

            # agent prompts
            count = self._db.execute(
                text("SELECT COUNT(*) FROM agent_prompts WHERE application_slug = :slug"),
                {"slug": slug},
            ).scalar()
            if count and count > 0:
                passed.append(f"{count} agent prompt(s) stored in agent_prompts table")
            else:
                failed.append("No agent prompts found for this application — re-run registration")

            # registered audit event
            reg_event = self._db.execute(
                text("""
                    SELECT id FROM audit_logs
                    WHERE project_id = :pid AND action = 'registered'
                    LIMIT 1
                """),
                {"pid": project_id},
            ).fetchone()
            if reg_event:
                passed.append("Registration audit event confirmed in audit_logs")
            else:
                failed.append("No 'registered' audit event found — registration may be incomplete")
        else:
            failed.append("Project not registered — run Phase 1 registration first")
            failed.append("Agent prompts cannot be verified (project not found)")

        return passed, failed

    def _check_phase_2_to_3(self, slug: str) -> tuple[list[str], list[str]]:
        passed, failed = [], []

        # find project_id
        row = self._db.execute(
            text("SELECT id FROM projects WHERE name ILIKE :name"),
            {"name": f"%{slug}%"},
        ).fetchone()

        if not row:
            failed.append("Project not found in PostgreSQL — complete Phases 1 and 2 first")
            return passed, failed

        project_id = str(row[0])

        # graph_seeded event
        seeded = self._db.execute(
            text("""
                SELECT id FROM audit_logs
                WHERE project_id = :pid AND action = 'graph_seeded'
                LIMIT 1
            """),
            {"pid": project_id},
        ).fetchone()
        if seeded:
            passed.append("graph_seeded event confirmed in audit_logs")
        else:
            failed.append("No graph_seeded event found — run 'Seed Graph' in Phase 2 first")

        # Neo4j nodes
        if self.arkhitx:
            try:
                ctx = self.arkhitx.get_grounding_context(entity_type="*")
                node_count = len(ctx.get("nodes", []))
                if node_count > 0:
                    passed.append(f"Neo4j knowledge graph contains {node_count} node(s)")
                else:
                    failed.append("Neo4j graph is empty — seed_data.json may not have been loaded correctly")
            except Exception:
                failed.append("Could not connect to Neo4j to verify node count")
        else:
            failed.append("Neo4j connection unavailable — check ARKHITX_NEO4J_URI configuration")

        return passed, failed

    def _check_phase_3(self, slug: str) -> tuple[list[str], list[str]]:
        passed, failed = [], []

        row = self._db.execute(
            text("SELECT id FROM projects WHERE name ILIKE :name"),
            {"name": f"%{slug}%"},
        ).fetchone()

        if not row:
            failed.append("Project not found — complete Phases 1, 2, and 3 first")
            return passed, failed

        project_id = str(row[0])

        grounding_count = self._db.execute(
            text("SELECT COUNT(*) FROM grounding_records WHERE project_id = :pid"),
            {"pid": project_id},
        ).scalar() or 0

        if grounding_count > 0:
            passed.append(f"{grounding_count} grounding record(s) — agents are querying the knowledge graph")
        else:
            failed.append("No grounding records yet — trigger an agent call to verify grounding is wired")

        llm_call_count = self._db.execute(
            text("SELECT COUNT(*) FROM audit_logs WHERE project_id = :pid AND action = 'llm_call'"),
            {"pid": project_id},
        ).scalar() or 0

        if llm_call_count > 0:
            passed.append(f"{llm_call_count} audited LLM call(s) confirmed in audit_logs")
        else:
            failed.append("No audited LLM calls found — ensure agents inherit GovernedBaseAgent")

        return passed, failed

    # ─── public entry point ─────────────────────────────────────────────────

    def run(self, slug: str, target_phase: int) -> dict:
        """
        Validate whether a project can advance to target_phase.

        Args:
            slug:         Application slug (e.g. 'contract-review')
            target_phase: The phase to advance to (1, 2, or 3)

        Returns:
            {
                "can_advance":    bool,
                "current_phase":  int,
                "target_phase":   int,
                "gates_passed":   [...],
                "gates_failed":   [...],
                "action_required": str   (empty if can_advance)
            }
        """
        if target_phase not in (1, 2, 3):
            raise ValueError("target_phase must be 1, 2, or 3")

        current_phase = target_phase - 1
        app_dir = _app_dir(slug)

        passed: list[str] = []
        failed: list[str] = []

        if target_phase == 1:
            if app_dir is None:
                failed.append(f"Application directory not found for '{slug}'")
            else:
                p, f = self._check_phase_0_to_1(slug, app_dir)
                passed.extend(p)
                failed.extend(f)

        elif target_phase == 2:
            p, f = self._check_phase_1_to_2(slug)
            passed.extend(p)
            failed.extend(f)

        elif target_phase == 3:
            p, f = self._check_phase_2_to_3(slug)
            passed.extend(p)
            failed.extend(f)

        can_advance = len(failed) == 0

        action_required = ""
        if not can_advance:
            gate_summary = "\n".join(f"- {g}" for g in failed)
            user_message = (
                f"Project: {slug}\n"
                f"Trying to advance to: Phase {target_phase}\n"
                f"Failed gates:\n{gate_summary}\n\n"
                "Explain what the user must do to advance, using the ProjectPhase "
                "context from the grounding nodes."
            )
            try:
                result = self.call_llm_json(user_message)
                action_required = result.get("action_required", "")
            except Exception:
                action_required = f"Complete the following before advancing to Phase {target_phase}: " + "; ".join(failed)

        return {
            "can_advance": can_advance,
            "current_phase": current_phase,
            "target_phase": target_phase,
            "gates_passed": passed,
            "gates_failed": failed,
            "action_required": action_required,
        }

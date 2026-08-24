"""
ArkhitXAgent — base class for ArkhitX's own internal agents.

These agents ARE governed by ArkhitX (they log to ArkhitX's own audit trail
and ground against the GovernanceRule nodes). This is self-governance in action:
ArkhitX applies to itself the same rules it enforces on every other project.

Usage:
    class MyAgent(ArkhitXAgent):
        agent_id = "arkhitx-my-agent"

        def _default_system_prompt(self) -> str:
            return "Fallback prompt used when DB record is missing."

        def run(self, *args, **kwargs):
            return self.call_llm_json("Do the task...")
"""

from __future__ import annotations

import sys

from sqlalchemy import text
from sqlalchemy.orm import Session

if "/sdk" not in sys.path:
    sys.path.insert(0, "/sdk")

from arkhitx.client import ArkhitXClient
from arkhitx.governed_agent import GovernedBaseAgent


class ArkhitXAgent(GovernedBaseAgent):
    """
    Abstract base for all ArkhitX-internal agents.

    - Automatically looks up the arkhitx-framework project_id from PostgreSQL
    - Grounds every LLM call against GovernanceRule nodes in Neo4j
    - All audit events are logged under the arkhitx-framework project
    """

    agent_id: str | None = None

    def __init__(self, db: Session):
        row = db.execute(
            text("SELECT id FROM projects WHERE name = 'ArkhitX Framework'")
        ).fetchone()
        own_project_id = str(row[0]) if row else None

        client = ArkhitXClient(project_id=own_project_id)
        super().__init__(arkhitx=client)

    def _grounding_query(self, user_message: str) -> dict | None:
        """All ArkhitX agents ground against the GovernanceRule knowledge graph."""
        return {"entity_type": "GovernanceRule"}

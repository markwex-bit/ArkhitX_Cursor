"""
GroundingQueryGeneratorAgent
=============================

Given an agent's name, purpose, and the project's ontology, generates the
correct `_grounding_query()` implementation for that agent.

This is the code the developer pastes into their agent class as part of
Phase 3 wiring. The generated query is specific to what that agent actually
needs from the knowledge graph — not a generic template.

Grounded against: GovernanceRule nodes (RULE-002: every agent must override
_grounding_query() to retrieve relevant context before calling the LLM).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from sqlalchemy.orm import Session

from app.agents.base import ArkhitXAgent

WORKSPACE = Path(os.getenv("ARKHITX_WORKSPACE", "/workspace"))


class GroundingQueryGeneratorAgent(ArkhitXAgent):
    """
    Generates a tailored _grounding_query() implementation for a specific agent
    in a specific project.
    """

    agent_id = "arkhitx-grounding-query-generator"

    def _default_system_prompt(self) -> str:
        return """You are the ArkhitX Grounding Query Generator. Given a description of what an AI agent does and the entity types available in the project's Neo4j knowledge graph, you generate the correct _grounding_query() Python method for that agent.

The output must include:
1. The complete Python _grounding_query() method implementation
2. The Cypher query it will use (for human review)
3. An explanation of what the query retrieves and why it is relevant to this agent

Return ONLY valid JSON in this format:
{
  "method_code": "    def _grounding_query(self, user_message: str) -> dict | None:\n        ...",
  "cypher_query": "MATCH (n:EntityType) ...",
  "explanation": "This query retrieves X because this agent needs Y to do Z",
  "entity_types_used": ["EntityType1", "EntityType2"]
}

Rules for generating the query:
- The method must return a dict with at least "entity_type" key, or None to skip grounding
- Use the entity types from the project ontology that are actually relevant to this agent's work
- Filters should narrow the result to the most relevant nodes (e.g. high-risk suppliers if the agent scores supplier risk)
- If multiple entity types are relevant, return the most important one — the GovernedBaseAgent will traverse relationships automatically
- The method signature must be exactly: def _grounding_query(self, user_message: str) -> dict | None:
- Use 4-space indentation inside the method
- The returned dict can have: entity_type (required), filters (optional dict), depth (optional int 1-3)"""

    def run(
        self,
        slug: str,
        agent_name: str,
        agent_purpose: str,
        entity_types: list[str] | None = None,
    ) -> dict:
        """
        Generate a _grounding_query() implementation.

        Args:
            slug:          Project slug (used to load ontology if entity_types not provided)
            agent_name:    Name of the agent class (e.g. "ContractReviewAgent")
            agent_purpose: What this agent does in plain English
            entity_types:  Optional list of entity type names from the ontology
                          (if not provided, reads from the project's ontology JSON)

        Returns:
            {
                "method_code": "...",
                "cypher_query": "...",
                "explanation": "...",
                "entity_types_used": [...]
            }
        """
        if not entity_types:
            entity_types = self._load_entity_types(slug)

        ontology_summary = (
            f"Available entity types in Neo4j: {', '.join(entity_types)}"
            if entity_types
            else "No ontology information available — use generic GovernanceRule grounding."
        )

        user_message = f"""Generate a _grounding_query() method for this agent:

Agent class name: {agent_name}
Agent purpose: {agent_purpose}
Project: {slug}
{ontology_summary}

The GovernanceRule nodes are also always available in Neo4j (for framework-level grounding).

Generate the most useful grounding query for this specific agent's work. Return JSON."""

        return self.call_llm_json(user_message)

    def _load_entity_types(self, slug: str) -> list[str]:
        """Load entity type names from the project's ontology JSON file."""
        ontology_path = WORKSPACE / "projects" / slug / "ontology" / f"{slug.replace('-', '_')}.json"
        if not ontology_path.exists():
            return []
        try:
            data = json.loads(ontology_path.read_text(encoding="utf-8"))
            return list(data.get("entity_types", {}).keys())
        except Exception:
            return []

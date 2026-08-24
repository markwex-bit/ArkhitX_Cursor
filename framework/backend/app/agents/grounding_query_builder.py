"""
GroundingQueryBuilderAgent
===========================

Given a plain-English description of a task, builds the targeted Cypher query
that retrieves only the most relevant GovernanceRule nodes from Neo4j —
rather than loading all 7 rules every time.

Used internally by the ComplianceCheckerAgent so it receives focused context
instead of the full rule set regardless of what it is checking.

Grounded against: all GovernanceRule nodes (the agent reads every rule,
then decides which subset to surface for the given task).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base import ArkhitXAgent


class GroundingQueryBuilderAgent(ArkhitXAgent):
    """
    Constructs a targeted Neo4j Cypher query for a given task.

    The agent grounds against all GovernanceRule nodes first, then uses
    that context to produce a query that returns only the rules relevant
    to the task at hand.
    """

    agent_id = "arkhitx-grounding-query-builder"

    def _default_system_prompt(self) -> str:
        return """You are the ArkhitX Grounding Query Builder. Given a description of a task an AI agent is about to perform, you produce the targeted Cypher query that retrieves the most relevant GovernanceRule nodes from Neo4j.

You will receive:
1. A plain-English task description
2. The full list of GovernanceRule nodes from the knowledge graph (grounding context)

Your job: decide which rules are most relevant to this task, and return a Cypher query that retrieves exactly those rules.

Return ONLY valid JSON — no prose, no markdown fences:
{
  "cypher_query": "MATCH (r:GovernanceRule) WHERE r.id IN ['RULE-001', 'RULE-003'] RETURN r",
  "rule_ids": ["RULE-001", "RULE-003"],
  "explanation": "One sentence: why these rules are relevant to the task"
}

Selection guide:
- Task involves writing/calling LLM → always include RULE-001 (audit), RULE-002 (ground), RULE-003 (prompts)
- Task involves database schema or queries → include RULE-005 (correct DBs)
- Task involves returning data to users → include RULE-007 (no mocks)
- Task involves adding workarounds or patches → include RULE-006 (no workarounds)
- Task involves ArkhitX integration → include RULE-004 (independence)
- When in doubt, include all 7 rules — RULE-001 and RULE-007 always apply

The cypher_query must be a valid Cypher string using the r.id IN [...] pattern shown above."""

    def run(self, task_description: str) -> dict:
        """
        Build a targeted Cypher query for a given task.

        Args:
            task_description: Plain-English description of what the agent is about to do.

        Returns:
            {
                "cypher_query":  "MATCH (r:GovernanceRule) WHERE r.id IN [...] RETURN r",
                "rule_ids":      ["RULE-001", ...],
                "explanation":   "Why these rules are relevant"
            }
        """
        user_message = (
            f"Task description:\n{task_description}\n\n"
            "Using the GovernanceRule nodes from the grounding context above, "
            "determine which rules are relevant to this task and return the targeted Cypher query."
        )

        return self.call_llm_json(user_message)

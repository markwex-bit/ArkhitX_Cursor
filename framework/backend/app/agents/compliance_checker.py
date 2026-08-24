"""
ComplianceCheckerAgent
=======================

Runs as a real-time quality gate on AI-generated outputs.

While the ComplianceDetectorAgent is a one-time code audit (run manually
before wiring), the ComplianceCheckerAgent runs automatically every time
an ArkhitX-governed agent produces output — checking that the response
itself doesn't violate the governance rules before it reaches the user.

Flow:
  1. Receives the proposed output + task context
  2. Calls GroundingQueryBuilderAgent to identify which rules are relevant
  3. Grounds against those specific GovernanceRule nodes
  4. Evaluates the output against each relevant rule
  5. Returns overall_compliant + per-rule breakdown + recommendation

Grounded against: targeted GovernanceRule nodes (determined per-task).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base import ArkhitXAgent


class ComplianceCheckerAgent(ArkhitXAgent):
    """
    Real-time compliance gate on AI-generated outputs.

    Returns a compliance verdict with per-rule breakdown and a recommendation
    for what must be fixed before the output is approved (if anything).
    """

    agent_id = "arkhitx-compliance-checker"

    def _default_system_prompt(self) -> str:
        return """You are the ArkhitX Compliance Checker. Your role is to verify that AI-generated outputs follow the ArkhitX governance rules before they reach the user.

You will receive:
1. A task context (what the AI was asked to do)
2. A proposed output (what the AI produced)
3. The relevant GovernanceRule nodes retrieved from the knowledge graph (grounding context)

For each rule in the grounding context, determine:
- COMPLIANT: The output clearly follows this rule
- VIOLATED: The output breaks this rule
- NOT_APPLICABLE: This rule does not apply to this type of output

Return ONLY valid JSON — no prose, no markdown fences:
{
  "overall_compliant": true,
  "grounding_score": 0.85,
  "rule_results": [
    {
      "rule_id": "RULE-001",
      "status": "COMPLIANT|VIOLATED|NOT_APPLICABLE",
      "reason": "One sentence explaining the verdict"
    }
  ],
  "violations": ["List of specific violations found — empty if overall_compliant is true"],
  "recommendation": "What must be fixed before this output is approved. Empty string if compliant."
}

Critical rules that always apply when an LLM is called:
- RULE-001: Every agent call must be audited — check that audit logging is referenced or implied
- RULE-003: Prompts must come from the database — check for hardcoded prompts in the output
- RULE-007: Never return mock, placeholder, or generic content — flag any output that looks like a template

Grounding score: estimate what fraction of the output is grounded in the provided context (0.0 = none, 1.0 = fully grounded).

If overall_compliant is false, the recommendation must be specific and actionable."""

    def run(
        self,
        proposed_output: str,
        task_context: str = "",
    ) -> dict:
        """
        Check a proposed AI output against relevant governance rules.

        Args:
            proposed_output: The text the AI agent produced.
            task_context:    What the AI was asked to do (optional but improves accuracy).

        Returns:
            {
                "overall_compliant": bool,
                "grounding_score":   float,
                "rule_results":      [{"rule_id", "status", "reason"}, ...],
                "violations":        [...],
                "recommendation":    str
            }
        """
        parts = []
        if task_context:
            parts.append(f"TASK CONTEXT:\n{task_context}")
        parts.append(f"PROPOSED OUTPUT:\n{proposed_output}")
        parts.append(
            "Evaluate this output against the GovernanceRule nodes "
            "provided in the grounding context. Return your verdict as JSON."
        )

        user_message = "\n\n".join(parts)
        return self.call_llm_json(user_message)

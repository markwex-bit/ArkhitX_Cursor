"""
ComplianceDetectorAgent
=======================

Reads a project's agent Python files and checks whether the ArkhitX wiring
rules (RULE-001 through RULE-007) are satisfied in the code.

Returns per-rule findings that pre-fill the Wiring Checklist in the UI.
The human still reviews and signs off — this agent does the investigation,
the human confirms the conclusion.

Grounded against: GovernanceRule nodes — the agent literally reads the rules
it is checking from Neo4j before evaluating the code.
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy.orm import Session

from app.agents.base import ArkhitXAgent

WORKSPACE = Path(os.getenv("ARKHITX_WORKSPACE", "/workspace"))

AGENT_PATHS = [
    "backend/app/agents",
    "backend/app/main.py",
    "backend/app/config.py",
    ".env",
]

MAX_FILE_CHARS = 4_000
MAX_TOTAL_CHARS = 24_000


class ComplianceDetectorAgent(ArkhitXAgent):
    """
    Reads project agent files and checks compliance with the 7 governance rules.
    Returns findings that pre-populate the Wiring Checklist.
    """

    agent_id = "arkhitx-compliance-detector"

    def _default_system_prompt(self) -> str:
        return """You are the ArkhitX Compliance Detector. You read Python source code from an AI application and determine whether each ArkhitX governance rule is satisfied by the code.

You will receive:
1. The code files from the project's agent layer
2. The list of GovernanceRules retrieved from the knowledge graph

For each rule, return one of:
- "COMPLIANT": Clear evidence the rule is followed
- "PARTIAL": The rule is partially implemented but has gaps
- "MISSING": No evidence the rule is followed
- "NOT_APPLICABLE": This rule genuinely does not apply to this project type

Return ONLY valid JSON in this exact format:
{
  "findings": [
    {
      "rule_id": "RULE-001",
      "status": "COMPLIANT|PARTIAL|MISSING|NOT_APPLICABLE",
      "evidence": "What you found in the code that informed this status",
      "suggestion": "What to do to reach COMPLIANT (empty string if already compliant)"
    }
  ],
  "summary": "One sentence overall assessment"
}

Rules for evaluation:
- RULE-001 (Audited): Look for log_audit() calls, GovernedBaseAgent usage, or ArkhitXClient.log_audit()
- RULE-002 (Grounded): Look for _grounding_query() override returning non-None, get_grounding_context() calls
- RULE-003 (DB prompts): Look for get_prompt() calls vs hardcoded system prompt strings in get_system_prompt()
- RULE-004 (Independent): Look for try/except around ArkhitX imports, fallback to local prompts when ARKHITX_DATABASE_URL missing
- RULE-005 (Correct DBs): Look for domain data being written to Neo4j, governance data to PostgreSQL — not mixed
- RULE-006 (No workarounds): Look for bare except:, except Exception: pass, hardcoded special cases, TODO/FIXME in production paths
- RULE-007 (No mocks): Look for hardcoded return strings, "N/A", "Sample", placeholder content in agent responses

Be specific in the evidence field — quote actual code fragments you found."""

    def run(self, slug: str) -> dict:
        """
        Detect compliance for a project.

        Returns:
            {
                "findings": [...per-rule findings...],
                "summary": "...",
                "files_read": [...]
            }
        """
        app_dir = WORKSPACE / "projects" / slug
        if not app_dir.exists():
            raise ValueError(f"Project directory not found: {app_dir}")

        files_read: list[str] = []
        code_sections: list[str] = []
        total_chars = 0

        def _read_file(path: Path, label: str) -> None:
            nonlocal total_chars
            if not path.exists() or total_chars >= MAX_TOTAL_CHARS:
                return
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
                excerpt = content[:MAX_FILE_CHARS]
                code_sections.append(f"# === {label} ===\n{excerpt}")
                files_read.append(label)
                total_chars += len(excerpt)
            except Exception:
                pass

        for rel in AGENT_PATHS:
            candidate = app_dir / rel
            if candidate.is_dir():
                for py_file in sorted(candidate.glob("*.py")):
                    if py_file.name.startswith("__"):
                        continue
                    _read_file(py_file, str(py_file.relative_to(app_dir)))
            else:
                _read_file(candidate, rel)

        if not code_sections:
            raise ValueError(f"No readable files found for '{slug}'")

        user_message = f"""Check ArkhitX governance compliance for project: {slug}

{chr(10).join(code_sections)}

Review the code above against each of the 7 GovernanceRules (provided in the grounding context from Neo4j).
Return your findings as JSON."""

        result = self.call_llm_json(user_message)

        return {
            **result,
            "files_read": files_read,
        }

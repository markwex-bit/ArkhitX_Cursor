"""
OntologyExtractorAgent
======================

Reads a project's Python source files and generates the ArkhitX ontology JSON
(entity types, properties, relationships) automatically.

The output is the ontology/{slug}.json file content — ready to save to disk
and then use in Phase 1 registration.

Grounded against: GovernanceRule nodes (especially ADR-004: ontology extracted
from code, not designed upfront).
"""

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy.orm import Session

from app.agents.base import ArkhitXAgent

WORKSPACE = Path(os.getenv("ARKHITX_WORKSPACE", "/workspace"))

# Files to read per project (ordered by value — models/schemas first)
CANDIDATE_PATHS = [
    "backend/app/models",
    "backend/app/schemas",
    "backend/app/agents",
    "backend/app/services",
]

MAX_FILE_CHARS = 3_000   # chars per file
MAX_TOTAL_CHARS = 20_000  # total context budget


class OntologyExtractorAgent(ArkhitXAgent):
    """
    Reads a project's Python models, schemas, and agent files,
    then asks Claude to extract the domain ontology.
    """

    agent_id = "arkhitx-ontology-extractor"

    def _default_system_prompt(self) -> str:
        return """You are the ArkhitX Ontology Extractor. Your job is to read Python source code from an AI application and extract the domain ontology — the entity types, their properties, and the relationships between them.

You must return ONLY valid JSON matching this schema exactly:

{
  "entity_types": {
    "EntityName": {
      "description": "What this entity represents",
      "id_field": "the field used as the unique identifier",
      "properties": {
        "field_name": {
          "type": "string|integer|float|boolean|list|dict",
          "required": true|false,
          "description": "What this property means"
        }
      }
    }
  },
  "relationship_types": {
    "RELATIONSHIP_NAME": {
      "description": "What this relationship means",
      "from": "SourceEntityName",
      "to": "TargetEntityName"
    }
  }
}

Rules:
- Only include domain entities (things the application works with), not framework/infrastructure classes
- Identify the most stable unique identifier field for each entity (usually 'id', 'name', or a domain-specific key)
- Infer relationships from foreign keys, association fields, or agent logic
- Use PascalCase for entity type names
- Use UPPER_SNAKE_CASE for relationship type names
- Be conservative — only include entities you are confident about from the code
- Return valid JSON only. No prose, no markdown, no code fences."""

    def run(self, slug: str) -> dict:
        """
        Extract the ontology for a project.

        Returns:
            {
                "ontology": { ...the generated JSON... },
                "files_read": [...list of files read...],
                "char_count": int
            }
        """
        app_dir = WORKSPACE / "projects" / slug
        if not app_dir.exists():
            raise ValueError(f"Project directory not found: {app_dir}")

        files_read: list[str] = []
        code_sections: list[str] = []
        total_chars = 0

        for rel_path in CANDIDATE_PATHS:
            dir_path = app_dir / rel_path
            if not dir_path.exists():
                continue
            for py_file in sorted(dir_path.glob("*.py")):
                if py_file.name.startswith("__"):
                    continue
                try:
                    content = py_file.read_text(encoding="utf-8", errors="ignore")
                    excerpt = content[:MAX_FILE_CHARS]
                    if total_chars + len(excerpt) > MAX_TOTAL_CHARS:
                        break
                    section = f"# === {py_file.relative_to(app_dir)} ===\n{excerpt}"
                    code_sections.append(section)
                    files_read.append(str(py_file.relative_to(app_dir)))
                    total_chars += len(excerpt)
                except Exception:
                    continue

        if not code_sections:
            raise ValueError(f"No readable Python source files found for '{slug}'")

        user_message = f"""Extract the ArkhitX domain ontology from this Python project (slug: {slug}).

{chr(10).join(code_sections)}

Based on the code above, return the ontology JSON. Focus on the domain entities this application manages — the things that matter to the business user (e.g. contracts, clauses, incidents, policies, suppliers), not the infrastructure (users, sessions, HTTP handlers)."""

        ontology = self.call_llm_json(user_message)

        return {
            "ontology": ontology,
            "files_read": files_read,
            "char_count": total_chars,
        }

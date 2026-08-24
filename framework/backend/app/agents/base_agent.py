import json
import logging
from abc import ABC, abstractmethod
from anthropic import Anthropic
from app.config import settings
from app.models.agent_prompt import AgentPrompt
from app.models.audit_log import AuditLog
from app.models.grounding_record import GroundingRecord

logger = logging.getLogger(__name__)


class AgentError(Exception):
    def __init__(self, agent_name: str, reason: str, context: dict = None):
        self.agent_name = agent_name
        self.reason = reason
        self.context = context or {}
        super().__init__(f"Agent '{agent_name}' failed: {reason}")


class BaseAgent(ABC):
    agent_name: str = "base"

    def __init__(self):
        self.client = Anthropic(api_key=settings.anthropic_api_key)

    def get_system_prompt(self, db) -> str:
        prompt_row = db.query(AgentPrompt).filter(AgentPrompt.id == self.agent_name).first()
        if not prompt_row:
            raise AgentError(
                self.agent_name,
                f"No prompt found in agent_prompts for id='{self.agent_name}'. "
                "Seed the prompt before running this agent.",
            )
        return prompt_row.system_prompt

    def get_prompt_config(self, db) -> dict:
        prompt_row = db.query(AgentPrompt).filter(AgentPrompt.id == self.agent_name).first()
        if not prompt_row:
            return {
                "model": settings.claude_model,
                "max_tokens": settings.claude_max_tokens,
                "temperature": settings.claude_temperature,
            }
        return {
            "model": prompt_row.model or settings.claude_model,
            "max_tokens": prompt_row.max_tokens or settings.claude_max_tokens,
            "temperature": prompt_row.temperature if prompt_row.temperature is not None else settings.claude_temperature,
        }

    def call_claude(self, system_prompt: str, user_message: str, db=None) -> str:
        config = self.get_prompt_config(db) if db else {
            "model": settings.claude_model,
            "max_tokens": settings.claude_max_tokens,
            "temperature": settings.claude_temperature,
        }

        response = self.client.messages.create(
            model=config["model"],
            max_tokens=config["max_tokens"],
            temperature=config["temperature"],
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text

    def call_claude_json(self, system_prompt: str, user_message: str, db=None) -> dict:
        raw = self.call_claude(system_prompt, user_message, db)
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise AgentError(self.agent_name, f"Failed to parse LLM JSON response: {e}", {"raw": raw[:500]})

    def build_context_message(self, question: str, graph_context: dict, instructions: str = "") -> str:
        parts = [f"QUESTION: {question}\n"]
        if instructions:
            parts.append(f"INSTRUCTIONS: {instructions}\n")
        parts.append("KNOWLEDGE GRAPH DATA:")
        parts.append(f"Query used: {graph_context.get('query_path', 'N/A')}")
        parts.append(f"Nodes returned: {graph_context.get('node_count', 0)}\n")

        for node in graph_context.get("nodes", []):
            node_type = node.get("_type", "Unknown")
            node_id = node.get("id", "N/A")
            props = {k: v for k, v in node.items() if not k.startswith("_")}
            parts.append(f"[{node_type}:{node_id}] {json.dumps(props, default=str)}")

        for edge in graph_context.get("edges", []):
            parts.append(
                f"  ({edge['from']}) -[{edge['type']}]-> ({edge['to']})"
                f" {json.dumps(edge.get('properties', {}), default=str)}"
            )
        return "\n".join(parts)

    def compute_grounding_score(self, response: dict, graph_context: dict) -> float:
        if not graph_context.get("nodes"):
            return 0.0
        evidence = response.get("supporting_evidence", [])
        if not evidence:
            return 0.1 if graph_context.get("nodes") else 0.0
        node_ids = {str(n.get("id", "")) for n in graph_context["nodes"]}
        cited = {str(e.get("node_id", "")) for e in evidence}
        valid = cited & node_ids
        return len(valid) / max(len(evidence), 1)

    def log_audit(self, db, project_id: str = None, action: str = "", context: dict = None, result: dict = None):
        entry = AuditLog(
            project_id=project_id,
            actor=f"agent:{self.agent_name}",
            action=action,
            context=context or {},
            result=result or {},
        )
        db.add(entry)
        db.commit()

    def store_grounding(self, db, project_id: str, grounding: dict):
        record = GroundingRecord(
            project_id=project_id,
            agent_name=self.agent_name,
            query_path=grounding.get("query_path"),
            cited_nodes=grounding.get("cited_nodes", []),
            cited_edges=grounding.get("cited_edges", []),
            node_count=grounding.get("node_count", 0),
            grounding_score=grounding.get("score", 0.0),
            response_summary=grounding.get("response_summary"),
        )
        db.add(record)
        db.commit()

    @abstractmethod
    def process(self, input_data: dict, db) -> dict:
        pass

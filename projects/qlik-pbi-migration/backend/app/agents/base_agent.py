import os
import json
from abc import ABC, abstractmethod
from anthropic import Anthropic
from app.config import get_settings

class BaseAgent(ABC):
    """
    Claude-powered base agent.

    Phase 0  — calls Claude directly, no governance.
    Phase 3  — if ARKHITX_DATABASE_URL is set, wraps calls with grounding
               context from Neo4j and logs every call to the audit trail.
    """

    def __init__(self):
        settings = get_settings()
        self._client = Anthropic(api_key=settings.anthropic_api_key)
        self._arkhitx = None

        if settings.arkhitx_database_url:
            try:
                from arkhitx import ArkhitXClient
                self._arkhitx = ArkhitXClient(
                    database_url=settings.arkhitx_database_url,
                    neo4j_uri=settings.arkhitx_neo4j_uri,
                    neo4j_user=settings.arkhitx_neo4j_user,
                    neo4j_password=settings.arkhitx_neo4j_password,
                )
            except ImportError:
                pass  # SDK not installed — run standalone

    @abstractmethod
    def get_system_prompt(self) -> str: ...

    @abstractmethod
    def process(self, data: dict) -> dict: ...

    # ── override in subclasses to enable KG grounding ─────────────────────────
    def _grounding_query(self, user_message: str) -> dict | None:
        return None

    def call_llm(self, user_message: str, system_prompt: str | None = None,
                 model: str = "claude-sonnet-4-5") -> str:
        system_prompt = system_prompt or self.get_system_prompt()
        grounding_data = None

        # Phase 3 — pre-call grounding
        if self._arkhitx:
            spec = self._grounding_query(user_message)
            if spec:
                grounding_data = self._arkhitx.get_grounding_context(**spec)
                if grounding_data:
                    context = json.dumps(grounding_data, indent=2)
                    system_prompt = (
                        f"{system_prompt}\n\n"
                        f"# Reference Data from Knowledge Graph\n{context}"
                    )

        response = self._client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text

        # Phase 3 — post-call audit + grounding score
        if self._arkhitx:
            audit_id = self._arkhitx.log_audit(
                project_id=os.getenv("ARKHITX_PROJECT_ID", ""),
                actor=self.__class__.__name__,
                action="call_llm",
                input_data={"user_message": user_message},
                output_data={"response": text},
                model=model,
                tokens_used=response.usage.input_tokens + response.usage.output_tokens,
            )
            if grounding_data:
                self._arkhitx.store_grounding(
                    audit_id=audit_id,
                    grounding_data=grounding_data,
                    response_text=text,
                )

        return text

    def call_llm_json(self, user_message: str, system_prompt: str | None = None) -> dict:
        text = self.call_llm(
            user_message,
            system_prompt=f"{system_prompt or self.get_system_prompt()}\n\nRespond with valid JSON only.",
        )
        # Strip markdown fences if present
        text = text.strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:])
            text = text.rsplit("```", 1)[0].strip()
        return json.loads(text)

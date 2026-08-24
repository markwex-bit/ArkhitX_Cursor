"""
GovernedBaseAgent — drop-in replacement for any project's BaseAgent.

Wraps the Anthropic LLM call with:
  1. Pre-call: query the knowledge graph for grounding context
  2. Post-call: compute grounding score, log audit entry, store grounding record
"""

from __future__ import annotations

import json
import re
import time
from abc import ABC, abstractmethod
from typing import Any

import anthropic

from arkhitx.client import ArkhitXClient


class GovernedBaseAgent(ABC):
    """
    Abstract base agent with ArkhitX governance and grounding built in.

    Subclasses must set `agent_id` and implement `_default_system_prompt()`.
    Optionally override `_grounding_query()` to customize KG context retrieval.
    """

    agent_id: str | None = None

    def __init__(
        self,
        arkhitx: ArkhitXClient | None = None,
        *,
        anthropic_api_key: str | None = None,
        model: str = "claude-sonnet-4-20250514",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ):
        import os
        api_key = anthropic_api_key or os.getenv("ANTHROPIC_API_KEY", "")
        self.anthropic_client = anthropic.Anthropic(api_key=api_key)
        self.arkhitx = arkhitx

        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self._system_prompt_override: str | None = None

        if self.arkhitx and self.agent_id:
            prompt_cfg = self.arkhitx.get_prompt(self.agent_id)
            if prompt_cfg:
                self.model = prompt_cfg["model"]
                self.max_tokens = prompt_cfg["max_tokens"]
                self.temperature = prompt_cfg["temperature"]
                self._system_prompt_override = prompt_cfg["system_prompt"]

    @abstractmethod
    def _default_system_prompt(self) -> str:
        """Fallback prompt used when no ArkhitX DB record exists."""

    def get_system_prompt(self) -> str:
        return self._system_prompt_override or self._default_system_prompt()

    def _grounding_query(self, user_message: str) -> dict | None:
        """
        Override in subclasses to provide a grounding query.
        Return a dict with 'entity_type' and optional 'filters' and 'depth',
        or None to skip grounding for this call.
        """
        return None

    def _compute_grounding_score(
        self, response_text: str, graph_context: dict
    ) -> float:
        """
        Compute how well the LLM response is grounded in the graph context.
        Returns 0.0-1.0.

        Default heuristic: ratio of graph node names/ids mentioned in the response.
        Override for domain-specific scoring.
        """
        nodes = graph_context.get("nodes", [])
        if not nodes:
            return 0.0

        response_lower = response_text.lower()
        mentioned = 0
        for node in nodes:
            identifiers = [
                str(node.get("id", "")),
                str(node.get("name", "")),
                str(node.get("account_number", "")),
                str(node.get("account_name", "")),
            ]
            for ident in identifiers:
                if ident and ident.lower() in response_lower:
                    mentioned += 1
                    break

        return min(1.0, mentioned / max(len(nodes), 1))

    def call_llm(
        self,
        user_message: str,
        max_tokens: int | None = None,
    ) -> str:
        """Call Claude with governance wrapping (audit + grounding)."""
        start_time = time.time()
        graph_context = None

        if self.arkhitx:
            grounding_spec = self._grounding_query(user_message)
            if grounding_spec:
                graph_context = self.arkhitx.get_grounding_context(
                    entity_type=grounding_spec["entity_type"],
                    filters=grounding_spec.get("filters"),
                    depth=grounding_spec.get("depth", 1),
                )
                if graph_context.get("nodes"):
                    context_text = json.dumps(graph_context["nodes"], indent=2)
                    user_message = (
                        f"{user_message}\n\n"
                        f"--- GROUNDING CONTEXT (from knowledge graph) ---\n"
                        f"{context_text}"
                    )

        response = self.anthropic_client.messages.create(
            model=self.model,
            max_tokens=max_tokens or self.max_tokens,
            temperature=self.temperature,
            system=self.get_system_prompt(),
            messages=[{"role": "user", "content": user_message}],
        )
        response_text = response.content[0].text
        elapsed_ms = int((time.time() - start_time) * 1000)

        if self.arkhitx:
            grounding_score = 0.0
            cited_nodes = []

            if graph_context and graph_context.get("nodes"):
                grounding_score = self._compute_grounding_score(
                    response_text, graph_context
                )
                cited_nodes = [
                    {"id": n.get("id"), "name": n.get("name")}
                    for n in graph_context["nodes"]
                ]

            self.arkhitx.log_audit(
                actor=f"agent:{self.agent_id}",
                action="llm_call",
                context={
                    "model": self.model,
                    "max_tokens": max_tokens or self.max_tokens,
                    "temperature": self.temperature,
                    "input_length": len(user_message),
                    "elapsed_ms": elapsed_ms,
                    "grounding_score": grounding_score,
                },
                result={
                    "output_length": len(response_text),
                    "response_preview": response_text[:500],
                },
            )

            self.arkhitx.store_grounding(
                agent_name=self.agent_id or "unknown",
                grounding_score=grounding_score,
                query_path=graph_context.get("query_path") if graph_context else None,
                cited_nodes=cited_nodes,
                response_summary=response_text[:300],
            )

        return response_text

    def call_llm_json(
        self,
        user_message: str,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Call Claude and parse the response as JSON, with governance wrapping."""
        prompt = (
            f"{user_message}\n\n"
            "Respond with valid JSON only. No prose before or after the JSON."
        )
        raw = self.call_llm(prompt, max_tokens=max_tokens)

        raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
        raw = re.sub(r"\s*```$", "", raw.strip())

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            pass

        trimmed = raw.rstrip()
        for _ in range(len(trimmed)):
            try:
                return json.loads(trimmed)
            except json.JSONDecodeError:
                trimmed = trimmed[:-1].rstrip()

        raise ValueError(
            f"Claude returned non-parseable JSON (length: {len(raw)}). "
            "Consider increasing max_tokens or reducing prompt size."
        )

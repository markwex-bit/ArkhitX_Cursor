# Agent Design Patterns

## The Base Agent Contract

Every agent in the solution extends `BaseAgent`. This ensures consistent behavior:
database-loaded prompts, structured LLM calls, grounding metadata, and audit logging.

### BaseAgent Responsibilities

1. **Load prompt from database** — `get_system_prompt(db)` reads from `agent_prompts`
   by `agent_name`. If the prompt doesn't exist, raise an error. Never fall back to
   a hardcoded string.

2. **Call Claude with structured output** — `call_claude(system_prompt, user_message)`
   calls the Anthropic API and returns parsed JSON. Model, temperature, and max_tokens
   come from the `agent_prompts` row.

3. **Compute grounding** — After receiving a response, determine how much of the
   answer is supported by graph data vs. pure LLM reasoning. Store in
   `grounding_records`.

4. **Log to audit trail** — Every call creates an `audit_logs` entry with the agent
   name, input summary, output summary, and timestamp.

5. **Return structured response** — Every agent returns a dict with at minimum:
   `{ "result": ..., "grounding": { "score": float, "cited_nodes": [...] } }`

### Agent Categories

**Pipeline Agents** — Run during specific phases to advance the project:
- Signal Extraction Agent (Phase 0)
- Ontology Design Agent (Phase 1)
- Data Mapping Agent (Phase 2)
- Graph Population scripts (Phase 3 — may not need LLM)
- Solution Agents (Phase 4-5 — built per project)

**Utility Agents** — Support tasks, not phase-specific:
- File Parser Agent — extracts structured data from uploaded files
- Validation Agent — rule-based checks (not LLM), no grounding needed

**Solution Agents** — Built during Phase 4, specific to the client's domain:
- One agent per Business Question (BQ) or group of related BQs
- Each bound to specific graph traversal paths
- These are the agents the client uses in production

### Creating a New Agent

```python
from app.agents.base_agent import BaseAgent

class SupplierRiskAgent(BaseAgent):
    """Answers: Which suppliers pose the highest risk to current orders?"""
    agent_name = "supplier_risk"

    async def process(self, input_data: dict, db) -> dict:
        system_prompt = self.get_system_prompt(db)

        graph_context = await self.grounding_service.retrieve(
            project_id=input_data["project_id"],
            query="""
                MATCH (s:Supplier)-[:SUPPLIES]->(c:Component)-[:USED_IN]->(p:Product)
                WHERE s.risk_score > 0.7
                RETURN s, c, p
            """,
        )

        user_message = self.build_context_message(
            question=input_data.get("question", "Which suppliers are highest risk?"),
            graph_context=graph_context,
            additional_context=input_data.get("context", {})
        )

        response = await self.call_claude(
            system_prompt=system_prompt,
            user_message=user_message,
            db=db
        )

        return {
            "result": response,
            "grounding": {
                "score": self.compute_grounding_score(response, graph_context),
                "cited_nodes": graph_context["nodes"],
                "query_path": graph_context["query_path"],
            }
        }
```

### Prompt Design Rules

1. **System prompts define the agent's role and constraints.** They do not contain
   client data. Client context comes in the user message.

2. **System prompts instruct the agent to cite sources.** Include instructions like:
   "When making a claim, reference the specific entity or relationship from the
   provided context that supports it."

3. **System prompts enforce output structure.** Specify the exact JSON schema the
   agent must return. Example:
   ```
   Return your answer as JSON with this structure:
   {
     "answer": "Your answer here",
     "confidence": 0.0-1.0,
     "supporting_evidence": [
       { "node_id": "...", "node_type": "...", "relevance": "..." }
     ],
     "caveats": ["Any limitations or assumptions"]
   }
   ```

4. **Prompts are domain-agnostic in the template.** Pipeline agent prompts (signal
   extraction, ontology design) ship with the starter template. Solution agent
   prompts are created by Cursor during Phase 4, tailored to the client's domain.

### Grounding Score Computation

The grounding score measures how much of an agent's response is supported by
the graph data it received.

**Simple approach (recommended for most projects):**

```python
def compute_grounding_score(self, response: dict, graph_context: dict) -> float:
    if not graph_context.get("nodes"):
        return 0.0

    cited_count = len(response.get("supporting_evidence", []))
    claim_count = max(len(response.get("supporting_evidence", [])), 1)

    node_ids_in_context = {n["id"] for n in graph_context["nodes"]}
    cited_ids = {e["node_id"] for e in response.get("supporting_evidence", [])}
    valid_citations = cited_ids & node_ids_in_context

    return len(valid_citations) / max(claim_count, 1)
```

**Advanced approach (Level 2 governance):**
- Use a separate LLM call to evaluate grounding (judge model)
- Parse each claim in the response and check if a graph node supports it
- Weight by claim importance

### Error Handling

```python
class AgentError(Exception):
    """Raised when an agent cannot complete its task."""
    def __init__(self, agent_name: str, reason: str, context: dict = None):
        self.agent_name = agent_name
        self.reason = reason
        self.context = context or {}
        super().__init__(f"Agent '{agent_name}' failed: {reason}")
```

**Rules:**
- If the LLM API fails, raise `AgentError`. Do not return placeholder content.
- If the prompt is missing from the database, raise `AgentError`.
- If the graph context is empty and the agent requires it, raise `AgentError` with
  a message indicating the graph needs data.
- All errors are logged to `audit_logs` with `action: "agent_error:{agent_name}"`.

### Agent Configuration via Database

The `agent_prompts` table stores per-agent configuration:

| Field | Purpose |
|-------|---------|
| `id` | Unique key (e.g., `supplier_risk`) |
| `agent_name` | Display name |
| `system_prompt` | The full system prompt text |
| `model` | Claude model to use (e.g., `claude-sonnet-4-20250514`) |
| `max_tokens` | Maximum response length |
| `temperature` | Creativity vs. determinism (lower = more deterministic) |

To change an agent's behavior, update the row in `agent_prompts` — no code
deployment needed. This is the core principle of prompt-as-data governance.

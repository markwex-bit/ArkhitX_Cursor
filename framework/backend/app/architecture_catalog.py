"""
Phase A (Architecture & Design) document catalog.

Defines every architecture artifact ArkhitX can track for a project, grouped
into two tiers:

  - "core" documents exist in BOTH tiers (lightweight and full)
  - "full"  documents exist ONLY in the full package tier

A project's architecture_tier ("lightweight" | "full") determines which rows
get created in `architecture_documents` when the tier is chosen — see
POST /api/projects/{id}/architecture/tier in app/api/architecture.py.

This is deliberately data, not code — adding a new document type is a catalog
edit, not a schema change.
"""

from __future__ import annotations

CATALOG: list[dict] = [
    # ── Problem Framing ─────────────────────────────────────────────────
    {
        "key": "problem_statement",
        "title": "Problem Statement & Business Case",
        "category": "Problem Framing",
        "tier": "core",
        "guidance": (
            "What business problem is this solving? Who asked for it, what's "
            "broken today, and what does 'done' look like? Keep it outcome-"
            "focused, not solution-focused."
        ),
    },
    {
        "key": "success_criteria",
        "title": "Success Criteria",
        "category": "Problem Framing",
        "tier": "core",
        "guidance": (
            "Measurable outcomes, not vibes. E.g. 'reduce manual triage time "
            "from 3 days to 1 hour' rather than 'make it faster'."
        ),
    },
    {
        "key": "stakeholder_map",
        "title": "Stakeholder Map & RACI",
        "category": "Problem Framing",
        "tier": "full",
        "guidance": (
            "Who approves, who consumes, who operates this post-launch. "
            "Responsible / Accountable / Consulted / Informed per major decision."
        ),
    },
    # ── Requirements ─────────────────────────────────────────────────────
    {
        "key": "requirements_summary",
        "title": "Requirements Summary",
        "category": "Requirements",
        "tier": "core",
        "guidance": (
            "Combined functional + non-functional requirements in one pass: "
            "what it must do, and how well it must do it (performance, scale, "
            "availability, compliance)."
        ),
    },
    {
        "key": "functional_requirements",
        "title": "Functional Requirements",
        "category": "Requirements",
        "tier": "full",
        "guidance": "User stories / use cases per persona, with acceptance criteria.",
    },
    {
        "key": "nonfunctional_requirements",
        "title": "Non-Functional Requirements",
        "category": "Requirements",
        "tier": "full",
        "guidance": (
            "Performance, scale (volume/concurrency), availability SLA, "
            "latency budget, applicable compliance regime (SOC2/HIPAA/GDPR/etc.)."
        ),
    },
    {
        "key": "data_requirements",
        "title": "Data Requirements",
        "category": "Requirements",
        "tier": "full",
        "guidance": (
            "Data sources, owners, volume, sensitivity classification, refresh "
            "cadence. What data exists, who controls it, how sensitive is it."
        ),
    },
    # ── Solution Architecture ────────────────────────────────────────────
    {
        "key": "system_context",
        "title": "System Context Diagram",
        "category": "Solution Architecture",
        "tier": "core",
        "guidance": (
            "C4 Level 1: this solution's boundary against the rest of the "
            "enterprise landscape — who/what talks to it, and how. A Mermaid "
            "diagram works well here."
        ),
    },
    {
        "key": "component_diagram",
        "title": "Container / Component Diagram",
        "category": "Solution Architecture",
        "tier": "full",
        "guidance": "C4 Level 2/3: services, agents, databases, and how they talk to each other.",
    },
    {
        "key": "domain_model_draft",
        "title": "Draft Domain Model",
        "category": "Solution Architecture",
        "tier": "full",
        "guidance": (
            "A HYPOTHESIS ontology sketched from requirements — entities, "
            "properties, relationships. Mark it draft; Phase 1 will extract "
            "the real ontology from working code and reconcile against this."
        ),
    },
    {
        "key": "agent_architecture",
        "title": "AI / Agent Architecture",
        "category": "Solution Architecture",
        "tier": "full",
        "guidance": (
            "Agent roles, orchestration pattern (single vs multi-agent, "
            "orchestrator-worker vs pipeline), model selection and why, "
            "prompt/context strategy."
        ),
    },
    {
        "key": "retrieval_strategy",
        "title": "Retrieval / Grounding Strategy",
        "category": "Solution Architecture",
        "tier": "full",
        "guidance": (
            "For each anticipated agent 'ask', classify it and pick graph / "
            "structured / vector / hybrid retrieval (see "
            "ARCHITECTURE-PRINCIPLES.md, Layer 3: Grounding). Decide this "
            "before building, not just before wiring Phase 3 governance."
        ),
    },
    {
        "key": "data_flow",
        "title": "Data Flow Diagram",
        "category": "Solution Architecture",
        "tier": "full",
        "guidance": (
            "Sources -> processing -> storage tiers. Which data goes to "
            "Postgres vs Neo4j vs the app DB, and where human-in-the-loop "
            "gates sit in the flow."
        ),
    },
    {
        "key": "integration_architecture",
        "title": "Integration Architecture",
        "category": "Solution Architecture",
        "tier": "full",
        "guidance": (
            "External systems/APIs, auth method per integration, sequence "
            "diagrams for the 2-3 most critical flows."
        ),
    },
    {
        "key": "security_architecture",
        "title": "Security & Compliance Architecture",
        "category": "Solution Architecture",
        "tier": "full",
        "guidance": (
            "Authn/authz model, data classification handling, encryption at "
            "rest/in transit, applicable regulatory mapping, basic threat "
            "model (sensitive data, who could touch it, blast radius)."
        ),
    },
    # ── Decisions & Risk ──────────────────────────────────────────────────
    {
        "key": "tech_stack_matrix",
        "title": "Technology Stack Selection",
        "category": "Decisions & Risk",
        "tier": "full",
        "guidance": "Options scored against the NFRs above — why this stack, not another.",
    },
    {
        "key": "risk_register",
        "title": "Risk Register",
        "category": "Decisions & Risk",
        "tier": "core",
        "guidance": (
            "Technical, data-availability, integration, and compliance risks — "
            "each with likelihood, impact, and mitigation."
        ),
    },
    {
        "key": "cost_estimate",
        "title": "Cost Estimate",
        "category": "Decisions & Risk",
        "tier": "full",
        "guidance": "Rough TCO: compute, storage, LLM token spend at expected volume.",
    },
    # ── Deployment & Operations ──────────────────────────────────────────
    {
        "key": "deployment_topology",
        "title": "Deployment Topology",
        "category": "Deployment & Operations",
        "tier": "full",
        "guidance": "Target cloud, network zones, what's public vs private.",
    },
    {
        "key": "observability_plan",
        "title": "Observability Plan",
        "category": "Deployment & Operations",
        "tier": "full",
        "guidance": "What gets logged/metriced/alerted, and who reviews it.",
    },
    # ── Review & Sign-off ─────────────────────────────────────────────────
    {
        "key": "traceability_matrix",
        "title": "Requirements Traceability Matrix",
        "category": "Review & Sign-off",
        "tier": "full",
        "guidance": (
            "Each requirement mapped to the architecture element that "
            "satisfies it — nothing built should be untraceable to a need."
        ),
    },
    {
        "key": "review_record",
        "title": "Architecture Review Summary",
        "category": "Review & Sign-off",
        "tier": "core",
        "guidance": (
            "Narrative summary for the sign-off gate: what was reviewed, open "
            "issues, and the rationale for the approve/reject decision. The "
            "gate decision itself is recorded separately via the "
            "architecture_gate audit log."
        ),
    },
]


def docs_for_tier(tier: str) -> list[dict]:
    """Return catalog entries that belong to the given tier."""
    if tier == "full":
        return list(CATALOG)
    return [d for d in CATALOG if d["tier"] == "core"]


def catalog_by_key() -> dict[str, dict]:
    return {d["key"]: d for d in CATALOG}

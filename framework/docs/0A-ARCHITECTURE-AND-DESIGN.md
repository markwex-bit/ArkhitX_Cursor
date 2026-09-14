# Phase A: Architecture & Design

## Purpose

Decide **what** to build and **how** to build it **before any code is written** — like architectural drawings before a house. Phase A produces approved architecture documents and Architecture Decision Records (ADRs) that Phase 0 (Build Solution) follows as the blueprint.

No solution code, no `arkhitx-sdk` install, and no Neo4j work happen in this phase.

## Prerequisites

- A **Project** row exists in the ArkhitX Dashboard (Projects tab).
- Basic intake is captured: client name, project description, and pain points (Dashboard → Project workspace, or PATCH `/api/projects/{id}`).

## When to use lightweight vs full

Choose a tier in the Dashboard Architecture workspace before drafting documents.

| Tier | When to use | Document count |
|------|-------------|----------------|
| **Lightweight** | Small POC, internal tool, low compliance surface, single consultant owner | 6 core documents |
| **Full** | Client-facing delivery, regulated data, multi-stakeholder sign-off, production target | All 22 catalog documents |

**Lightweight core documents:** Problem Statement & Business Case, Success Criteria, Requirements Summary, System Context Diagram, Risk Register, Architecture Review Summary.

**Full package adds:** Stakeholder Map, detailed requirements (functional / non-functional / data), component and agent architecture, retrieval strategy, data flow, integration and security architecture, tech stack selection, cost estimate, deployment topology, observability plan, and requirements traceability matrix.

The authoritative list and per-document guidance live in `framework/backend/app/architecture_catalog.py` and are exposed via `GET /api/projects/{id}/architecture/catalog`.

## Steps

1. **Capture intake** — Record the business problem, constraints, and stakeholders in the project description and pain points. Be outcome-focused, not solution-focused.

2. **Choose tier and review mode** — In the Dashboard (Projects → your project → Architecture & Design):
   - Select **lightweight** or **full**.
   - Select **self** review (consultant-only) or **stakeholder** review (external sign-off expected).
   - This creates the required `architecture_documents` rows for your tier.

3. **Draft each document** — For each catalog document:
   - Use **Draft with AI** (ArchitectureDocumentAgent) to produce a first draft from intake context.
   - **Edit** the draft — resolve every `OPEN QUESTION` or remove speculative content.
   - Set status to **approved** only when the content is accurate and complete.
   - Never auto-approve: the agent always saves `status="draft"`.

4. **Log Architecture Decision Records (ADRs)** — For every major fork (model choice, retrieval strategy, cloud target, auth approach):
   - Create an ADR in the Decision Log tab.
   - Record context, options considered, the decision, and consequences.
   - ADRs capture *why*; architecture documents capture *what*.

5. **Choose retrieval strategy early (full tier)** — For each anticipated agent "ask", classify it and pick `graph`, `structured`, `vector`, or `hybrid` before Phase 0 build — see [ARCHITECTURE-PRINCIPLES.md](ARCHITECTURE-PRINCIPLES.md) (Layer 3: Grounding). Document the choice in the Retrieval / Grounding Strategy document. Phase 3 (Wire Governance) implements what Phase A decides here.

6. **Review and approve the architecture gate** — When required documents are approved:
   - Click **Review & Approve Gate** (architecture_gate).
   - You may approve with conditions — conditions are logged, not silently dropped.
   - On approval, the project advances to **Phase 0: Build Solution**.

## Retrospective mode (already-built projects)

If the solution was built before Phase A existed, populate `as_built_notes` on the project row with concatenated source material (`PHASE-0-BUILD.md`, `ARCHITECTURE.md`, key decision docs). The ArchitectureDocumentAgent runs in retrospective reconstruction mode: it grounds every claim in as-built facts and marks gaps as `OPEN QUESTION` rather than inventing content.

See `framework/backend/scripts/reverse_engineer_qlik_pbi.py` for a worked example.

## Exit criteria

- [ ] Tier chosen (lightweight or full).
- [ ] Every required document for that tier has status **approved**.
- [ ] Major architectural forks recorded as ADRs (at minimum: retrieval strategy if agents use grounding, model/provider choice, data placement).
- [ ] `architecture_gate` approved (with or without documented conditions).
- [ ] No unresolved `OPEN QUESTION` items that would block Phase 0 build.

## Outputs

- Approved architecture documents in PostgreSQL (`architecture_documents` table).
- ADRs in PostgreSQL (`architecture_decisions` table).
- Audit trail of gate decision in `audit_logs`.
- A build blueprint the consultant and Cursor follow in Phase 0.

## What Phase A does NOT produce

| Not in Phase A | Where it happens |
|----------------|------------------|
| Working code / agents | Phase 0 — Build Solution |
| Ontology extracted from code | Phase 1 — Register Ontology |
| Neo4j domain data | Phase 2 — Populate Graph |
| SDK / governance wiring | Phase 3 — Wire Governance |

The **Draft Domain Model** document (full tier) is a *hypothesis* only. Phase 1 reconciles it against the ontology extracted from working code.

## Dashboard reference

| Action | Location |
|--------|----------|
| Choose tier | Projects → project → Architecture & Design → tier selector |
| Draft / edit documents | Architecture workspace → Documents tab |
| Log ADRs | Architecture workspace → Decisions tab |
| Approve gate | Review & Approve Gate button |

## SDK / API reference

| Piece | Location |
|-------|----------|
| Document catalog | `framework/backend/app/architecture_catalog.py` |
| Draft agent | `framework/backend/app/agents/architecture_document_agent.py` |
| Phase A API | `framework/backend/app/api/architecture.py` |
| Gate advance | `POST /api/projects/{id}/gates/architecture_gate/decide` |

## Next phase

Proceed to [00-BUILD-SOLUTION.md](00-BUILD-SOLUTION.md) to implement the solution according to the approved architecture. Do not deviate from approved ADRs without recording a new ADR or reopening the relevant document.

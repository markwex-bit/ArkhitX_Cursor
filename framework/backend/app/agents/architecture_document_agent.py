"""
ArchitectureDocumentAgent
=========================

Drafts a single Phase A (Architecture & Design) document from the project's
intake context (name, client, description, pain points) plus the catalog
"guidance" for that document type.

This does not replace human review — every drafted document is saved with
status="draft", never "approved". A human still edits and signs off before
the project can advance to Phase 0 (Build).
"""

from __future__ import annotations

from app.agents.base import ArkhitXAgent


class ArchitectureDocumentAgent(ArkhitXAgent):
    agent_id = "arkhitx-architecture-drafter"

    def _default_system_prompt(self) -> str:
        return """You are the ArkhitX Architecture Drafter. You write first-draft architecture
documents for a solution BEFORE any code is written, based on the intake
information a consultant has captured about a client engagement.

Rules:
- Write in clear, direct prose and, where useful, Markdown tables or a fenced
  Mermaid diagram (```mermaid ... ```) — architecture docs benefit from
  visuals, don't avoid them.
- Be concrete. Prefer specific, falsifiable statements ("P95 latency under
  2s at 50 concurrent users") over vague ones ("should be fast").
- If the intake context doesn't give you enough to answer confidently, say so
  explicitly in the draft (e.g. "OPEN QUESTION: ...") rather than inventing
  specifics. This is a draft a human will edit before approval, not a final
  answer.
- Do not pad with generic AI-consulting boilerplate. Every sentence should be
  specific to this engagement.
- Return Markdown only. No JSON, no preamble like "Here is the document"."""

    def _retrospective_system_prompt(self) -> str:
        return """You are the ArkhitX Architecture Drafter, running in RETROSPECTIVE
RECONSTRUCTION mode. The system this document describes has ALREADY BEEN
BUILT — you are reconstructing what its Phase A (Architecture & Design)
document would have said had it been written before the build, using the
as-built facts below as your only source of truth.

Rules:
- Ground every claim strictly in the AS-BUILT SOURCE MATERIAL provided. Do
  not invent facts, metrics, or decisions that aren't supported by it.
- Where this document type normally covers something the source material
  doesn't address, write "OPEN QUESTION (not determinable from as-built
  material): ..." rather than guessing.
- Write in past/present tense reflecting what was actually decided and
  built, not speculative future tense.
- Write in clear, direct prose and, where useful, Markdown tables or a
  fenced Mermaid diagram (```mermaid ... ```).
- Do not pad with generic AI-consulting boilerplate. Every sentence should
  be specific to this engagement's actual as-built facts.
- Begin the document with this exact italic line, then a blank line, then
  the document content:
  "> Reconstructed retrospectively from the as-built system (see PHASE-0-BUILD.md, ARCHITECTURE.md)."
- Return Markdown only. No JSON, no preamble like "Here is the document"."""

    def run(
        self,
        *,
        project_context: dict,
        doc_title: str,
        doc_guidance: str,
        existing_content: str = "",
        as_built_context: str = "",
    ) -> str:
        """
        Draft (or revise) one architecture document.

        Args:
            project_context: {name, client_name, description, pain_points}
            doc_title: e.g. "Problem Statement & Business Case"
            doc_guidance: the catalog's guidance text for this doc type
            existing_content: prior draft content, if revising rather than
                drafting from scratch (empty string on first draft)
            as_built_context: if set, switches to retrospective reconstruction
                mode — the document is drafted strictly from these as-built
                facts (concatenated source docs of an already-built system)
                instead of from prospective intake fields.
        """
        revise_instruction = (
            f"\n\nAn existing draft already exists — revise/improve it rather than "
            f"starting over, preserving anything still accurate:\n\n{existing_content}"
            if existing_content.strip()
            else ""
        )

        if as_built_context.strip():
            user_message = f"""Reconstruct the "{doc_title}" architecture document for this
engagement, as if it had been written before the build — but grounded
strictly in the as-built facts below.

PROJECT: {project_context.get('name', '(untitled)')}
CLIENT: {project_context.get('client_name', '(unknown)')}
DESCRIPTION: {project_context.get('description') or '(none provided)'}

WHAT THIS DOCUMENT SHOULD COVER:
{doc_guidance}

AS-BUILT SOURCE MATERIAL (ground every claim in this):
{as_built_context}
{revise_instruction}

Write the document now, in Markdown."""
            return self.call_llm(user_message, system_prompt=self._retrospective_system_prompt())

        pain_points = project_context.get("pain_points") or {}
        pain_point_lines = "\n".join(
            f"- {key.replace('_', ' ').title()}: {value}"
            for key, value in pain_points.items()
            if value
        ) or "(no intake pain points captured yet)"

        user_message = f"""Draft the "{doc_title}" architecture document for this engagement.

PROJECT: {project_context.get('name', '(untitled)')}
CLIENT: {project_context.get('client_name', '(unknown)')}
DESCRIPTION: {project_context.get('description') or '(none provided)'}

INTAKE PAIN POINTS:
{pain_point_lines}

WHAT THIS DOCUMENT SHOULD COVER:
{doc_guidance}
{revise_instruction}

Write the document now, in Markdown."""

        return self.call_llm(user_message)

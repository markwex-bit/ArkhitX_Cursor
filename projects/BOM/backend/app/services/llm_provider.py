"""Pluggable LLM — none | anthropic | azure_openai | openai."""
from __future__ import annotations

import json
from typing import Any

from app.config import get_settings


def explain_comparison(question: str, comparison: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    provider = settings.llm_provider.lower().strip()

    if provider == "none" or not provider:
        return _template_explain(question, comparison)

    try:
        if provider == "anthropic" and settings.anthropic_api_key:
            text = _anthropic_explain(question, comparison, settings)
            return {"answer": text, "provider": "anthropic", "grounded": True}
        if provider == "azure_openai" and settings.azure_openai_endpoint:
            text = _openai_compatible_explain(question, comparison, settings, azure=True)
            return {"answer": text, "provider": "azure_openai", "grounded": True}
        if provider == "openai" and settings.openai_api_key:
            text = _openai_compatible_explain(question, comparison, settings, azure=False)
            return {"answer": text, "provider": "openai", "grounded": True}
    except Exception as exc:
        fallback = _template_explain(question, comparison)
        fallback["llm_error"] = str(exc)
        return fallback

    return _template_explain(question, comparison)


def _context_block(comparison: dict[str, Any]) -> str:
    kpis = comparison.get("kpis", {})
    gaps = comparison.get("gap_drivers", [])[:10]
    lines = [
        f"Baseline TPC: {kpis.get('baseline_tpc')}",
        f"Compare TPC: {kpis.get('compare_tpc')}",
        f"Gap: {kpis.get('gap')} ({kpis.get('gap_pct')})",
        "Top gap drivers:",
    ]
    for g in gaps:
        lines.append(f"  - {g['label']}: gap {g['gap']} (values {g['values']})")
    return "\n".join(lines)


def _template_explain(question: str, comparison: dict[str, Any]) -> dict[str, Any]:
    kpis = comparison.get("kpis", {})
    gaps = comparison.get("gap_drivers", [])[:5]
    bullets = []
    for g in gaps:
        direction = "increase" if g["gap"] > 0 else "decrease" if g["gap"] < 0 else "no change"
        bullets.append(f"• **{g['label']}**: {direction} of {abs(g['gap']):,.2f} TPC")
    answer = (
        f"**Summary** (deterministic — LLM_PROVIDER=none)\n\n"
        f"Baseline total: **{kpis.get('baseline_tpc', 0):,.2f}** → "
        f"Compare total: **{kpis.get('compare_tpc', 0):,.2f}** "
        f"(gap **{kpis.get('gap', 0):,.2f}**).\n\n"
        f"**Top drivers:**\n" + ("\n".join(bullets) if bullets else "No gap data (select 2+ costbooks).")
    )
    if question.strip():
        answer += f"\n\n*Your question:* {question.strip()}"
    return {"answer": answer, "provider": "template", "grounded": True}


def _anthropic_explain(question: str, comparison: dict[str, Any], settings: Any) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    msg = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=(
            "You explain vehicle costbook TPC gaps for cost engineers. "
            "Use ONLY the facts provided. Never invent TPC numbers."
        ),
        messages=[
            {
                "role": "user",
                "content": f"Context:\n{_context_block(comparison)}\n\nQuestion: {question or 'Summarize the main gap drivers.'}",
            }
        ],
    )
    return msg.content[0].text


def _openai_compatible_explain(question: str, comparison: dict[str, Any], settings: Any, azure: bool) -> str:
    from openai import OpenAI

    if azure:
        client = OpenAI(
            api_key=settings.azure_openai_api_key or "unused",
            base_url=f"{settings.azure_openai_endpoint.rstrip('/')}/openai/deployments/{settings.azure_openai_deployment}",
            default_query={"api-version": "2024-02-15-preview"},
        )
        model = settings.azure_openai_deployment
    else:
        client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url or None)
        model = "gpt-4o-mini"

    resp = client.chat.completions.create(
        model=model,
        max_tokens=1024,
        messages=[
            {"role": "system", "content": "Explain TPC gaps using only provided facts. Never invent numbers."},
            {
                "role": "user",
                "content": f"Context:\n{_context_block(comparison)}\n\nQuestion: {question or 'Summarize gap drivers.'}",
            },
        ],
    )
    return resp.choices[0].message.content or ""

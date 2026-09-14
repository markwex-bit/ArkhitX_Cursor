"""Log deterministic pipeline steps to ArkhitX Governance Pipeline Overview."""

from __future__ import annotations

import time
from contextlib import contextmanager
from typing import Any, Iterator

from app.governance.arkhitx_client import get_arkhitx_client

PROCESS_GROUP = "Migration Assessor Pipeline"


def log_pipeline_step(
    step_name: str,
    *,
    stage: str,
    step_type: str = "System",
    agent: str | None = None,
    status: str = "completed",
    input_summary: dict | None = None,
    output_summary: dict | None = None,
    duration_ms: int | None = None,
    error_message: str | None = None,
) -> None:
    client = get_arkhitx_client()
    if not client:
        return

    inp = dict(input_summary or {})
    inp.setdefault("scope", "solution")

    client.log_pipeline_step(
        step_name=step_name,
        status=status,
        stage=stage,
        process_group=PROCESS_GROUP,
        agent=agent,
        step_type=step_type,
        input_summary=inp,
        output_summary=output_summary,
        duration_ms=duration_ms,
        error_message=error_message,
    )


@contextmanager
def timed_pipeline_step(
    step_name: str,
    *,
    stage: str,
    step_type: str = "System",
    agent: str | None = None,
    input_summary: dict | None = None,
) -> Iterator[dict[str, Any]]:
    """Context manager that logs a pipeline step with elapsed time."""
    started = time.perf_counter()
    output: dict[str, Any] = {}
    error: str | None = None
    status = "completed"
    try:
        yield output
    except Exception as exc:
        status = "failed"
        error = str(exc)
        raise
    finally:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log_pipeline_step(
            step_name=step_name,
            stage=stage,
            step_type=step_type,
            agent=agent,
            status=status,
            input_summary=input_summary,
            output_summary=output or None,
            duration_ms=elapsed_ms,
            error_message=error,
        )

"""
Normalized catalog models for the Qlik <-> Power BI migration assessment tool.

These are the shapes ingestion.py produces from the raw sample JSON
(samples/qlik/qlik_apps_export.json, samples/powerbi/powerbi_scan_result.json).
Every downstream stage (eligibility, quality, matching, sign-off) operates on
these normalized models, never on the raw JSON directly.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConfidenceTier(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class Disposition(str, Enum):
    REUSE = "Reuse"
    EXTEND = "Extend"
    REBUILD = "Rebuild"
    SUNSET_NO_REPLACEMENT = "Sunset - No Replacement Needed"


class SignOffDecision(str, Enum):
    CONFIRMED = "confirmed"
    OVERRIDDEN = "overridden"
    NEEDS_MORE_INFO = "needs_more_info"


# ── Normalized entities ──────────────────────────────────────────────────────

class QlikApp(BaseModel):
    id: str
    name: str
    description: str = ""
    stream: str = ""
    owner: str = ""
    tags: list[str] = Field(default_factory=list)
    last_reload_time: Optional[str] = None
    data_connections: list[str] = Field(default_factory=list)
    measures: list[str] = Field(default_factory=list)
    dimensions: list[str] = Field(default_factory=list)
    sheets: list[str] = Field(default_factory=list)
    # Table/view names the load script actually reads from. Not available via
    # QRS at all — only populated when DATA_SOURCE=live and the Engine API's
    # GetScript result could be parsed (see services/qlik_extractor.py). Empty
    # for sample-data runs and for any live app whose script couldn't be parsed.
    tables: list[str] = Field(default_factory=list)


class PowerBIApp(BaseModel):
    dataset_id: str
    report_id: Optional[str] = None
    name: str
    description: str = ""
    workspace_id: str
    workspace_name: str
    workspace_type: str
    tables: list[str] = Field(default_factory=list)
    measures: list[str] = Field(default_factory=list)
    datasource_connections: list[str] = Field(default_factory=list)
    last_refresh_time: Optional[str] = None
    refresh_enabled: Optional[bool] = None
    has_refresh_schedule: bool = False
    endorsement: Optional[str] = None
    sensitivity_label: Optional[str] = None
    has_report: bool = False


# ── Eligibility (Stage 0a) ────────────────────────────────────────────────────

class EligibilityResult(BaseModel):
    dataset_id: str
    name: str
    workspace_name: str
    eligible: bool
    exclusion_reasons: list[str] = Field(default_factory=list)
    quality_flags: list[str] = Field(default_factory=list)


class EligibilitySummary(BaseModel):
    total: int
    eligible_count: int
    excluded_count: int
    by_reason: dict[str, int]
    results: list[EligibilityResult]


# ── Quality (Stage 0b + parity) ──────────────────────────────────────────────

class QlikQualityResult(BaseModel):
    app_id: str
    name: str
    completeness_score: float
    flags: list[str] = Field(default_factory=list)


class ParityRow(BaseModel):
    capability: str
    qlik: str
    power_bi: str
    note: str


# ── Matching (Stage 1-3) ─────────────────────────────────────────────────────

class MatchCandidate(BaseModel):
    qlik_app_id: str
    pbi_dataset_id: str
    pbi_name: str
    pbi_workspace_name: str
    lineage_match: bool
    lineage_signal: str
    name_similarity: float
    measure_overlap: float
    confidence_tier: ConfidenceTier
    signals_available: list[str] = Field(default_factory=list)
    signals_missing: list[str] = Field(default_factory=list)
    semantic_score: Optional[float] = None
    semantic_rationale: Optional[str] = None
    matched_concepts: list[str] = Field(default_factory=list)
    unmatched_concepts: list[str] = Field(default_factory=list)
    disposition: Optional[Disposition] = None
    effort: Optional[str] = None
    advisor_rationale: Optional[str] = None
    llm_used: bool = False


class QlikDispositionResult(BaseModel):
    qlik_app_id: str
    qlik_app_name: str
    candidates: list[MatchCandidate]
    disposition: Optional[Disposition] = None


# ── Sign-off (Stage 4) ────────────────────────────────────────────────────────

class SignOffRequest(BaseModel):
    qlik_app_id: str
    pbi_dataset_id: Optional[str] = None
    decision: SignOffDecision
    reviewer: str
    notes: str = ""


class SignOffRecord(SignOffRequest):
    timestamp: str


class BacklogEntry(BaseModel):
    qlik_app_id: str
    qlik_app_name: str
    pbi_dataset_id: Optional[str] = None
    pbi_name: Optional[str] = None
    disposition: Optional[Disposition] = None
    confidence_tier: Optional[ConfidenceTier] = None
    effort: Optional[str] = None
    decision: SignOffDecision
    reviewer: str
    notes: str = ""
    timestamp: str

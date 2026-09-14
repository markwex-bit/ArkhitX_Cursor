import uuid
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"))
    client_name = Column(String(255), nullable=False)
    description = Column(Text)
    # Phase -1 = Architecture & Design (pre-build gate). Phases 0-5 = the
    # Playbook's canonical build/governance pipeline (Build, Register,
    # Populate Graph, Wire Governance, Validate Grounding, Ship). -1 is
    # deliberately not zero so nothing about the existing phase pipeline has
    # to be renumbered.
    current_phase = Column(Integer, default=-1)
    phase_status = Column(String(50), default="in_progress")
    pain_points = Column(JSONB, default=dict)
    signals = Column(JSONB, default=dict)
    ontology_schema = Column(JSONB, default=dict)
    field_mappings = Column(JSONB, default=dict)
    validation_results = Column(JSONB, default=dict)
    metadata_ = Column("metadata", JSONB, default=dict)

    # Phase A (Architecture) fields
    architecture_tier = Column(String(20))  # "lightweight" | "full" | null (not yet chosen)
    architecture_review_mode = Column(String(20))  # "self" | "stakeholder" | null
    # Raw source material for retrospective ("reverse-engineered") Phase A
    # reconstructions — e.g. concatenated as-built docs from a project that
    # was built before Phase A existed. When set, ArchitectureDocumentAgent
    # grounds drafts in this material instead of drafting prospectively from
    # bare intake fields. Null/empty for normal forward-looking projects.
    as_built_notes = Column(Text)
    # Per-agent retrieval strategy: graph | structured | vector | hybrid
    retrieval_strategy = Column(JSONB, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("current_phase >= -1 AND current_phase <= 5", name="valid_phase"),
    )

    client = relationship("Client", back_populates="projects")
    audit_logs = relationship("AuditLog", back_populates="project", cascade="all, delete-orphan")
    grounding_records = relationship("GroundingRecord", back_populates="project", cascade="all, delete-orphan")
    pipeline_events = relationship("PipelineEvent", back_populates="project", cascade="all, delete-orphan")
    architecture_documents = relationship(
        "ArchitectureDocument", back_populates="project", cascade="all, delete-orphan"
    )
    architecture_decisions = relationship(
        "ArchitectureDecision", back_populates="project", cascade="all, delete-orphan"
    )
    gate_decisions = relationship(
        "GateDecisionRecord", back_populates="project", cascade="all, delete-orphan"
    )
    llm_usage_logs = relationship(
        "LlmUsageLog", back_populates="project", cascade="all, delete-orphan"
    )

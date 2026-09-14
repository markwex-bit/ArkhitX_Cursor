import uuid
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class ArchitectureDocument(Base):
    """
    One row per architecture artifact for a project's Phase A (Architecture &
    Design) gate — e.g. "Problem Statement", "System Context Diagram", "Risk
    Register". Which doc_keys exist for a project is determined by the
    project's architecture_tier (lightweight | full) — see
    app/architecture_catalog.py for the canonical catalog.
    """

    __tablename__ = "architecture_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    doc_key = Column(String(100), nullable=False)      # e.g. "problem_statement"
    title = Column(String(255), nullable=False)        # e.g. "Problem Statement & Business Case"
    category = Column(String(100), nullable=False)     # e.g. "Problem Framing"
    tier = Column(String(20), nullable=False)           # "core" | "full" — which tier requires it
    sort_order = Column(Integer, default=0)

    content = Column(Text, default="")                  # markdown content
    status = Column(String(20), default="not_started")  # not_started | draft | in_review | approved

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("project_id", "doc_key", name="uq_architecture_document_project_key"),
    )

    project = relationship("Project", back_populates="architecture_documents")

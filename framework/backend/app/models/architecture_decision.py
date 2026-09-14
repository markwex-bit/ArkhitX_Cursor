import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class ArchitectureDecision(Base):
    """
    An Architecture Decision Record (ADR) captured during Phase A.

    Deliberately its own table (not a fixed ArchitectureDocument row) because
    a project can have any number of ADRs — one per consequential choice
    (LLM provider, agent framework, retrieval strategy, cloud target, etc.).
    """

    __tablename__ = "architecture_decisions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    title = Column(String(255), nullable=False)
    context = Column(Text, default="")                 # why this decision is needed
    options_considered = Column(JSONB, default=list)    # [{"option": "...", "pros": "...", "cons": "..."}]
    decision = Column(Text, default="")                 # what was chosen
    consequences = Column(Text, default="")              # tradeoffs accepted
    status = Column(String(20), default="proposed")      # proposed | accepted | superseded

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project = relationship("Project", back_populates="architecture_decisions")

import uuid
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class GateDecisionRecord(Base):
    __tablename__ = "gate_decisions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    gate_name = Column(String(100), nullable=False)
    phase = Column(Integer, nullable=False)
    decision = Column(String(50), nullable=False)  # approved | rejected | approved_with_conditions
    reviewer = Column(String(255), nullable=False)
    notes = Column(Text)
    conditions = Column(JSONB, default=list)
    items_reviewed = Column(JSONB, default=dict)
    items_modified = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="gate_decisions")

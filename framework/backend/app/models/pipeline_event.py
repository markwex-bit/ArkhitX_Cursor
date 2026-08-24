import uuid
from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class PipelineEvent(Base):
    __tablename__ = "pipeline_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    phase = Column(Integer, nullable=False)
    step_name = Column(String(255), nullable=False)
    status = Column(String(50), default="started")
    input_summary = Column(JSONB, default=dict)
    output_summary = Column(JSONB, default=dict)
    duration_ms = Column(Integer)
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    project = relationship("Project", back_populates="pipeline_events")

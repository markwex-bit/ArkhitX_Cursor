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
    current_phase = Column(Integer, default=0)
    phase_status = Column(String(50), default="in_progress")
    pain_points = Column(JSONB, default=dict)
    signals = Column(JSONB, default=dict)
    ontology_schema = Column(JSONB, default=dict)
    field_mappings = Column(JSONB, default=dict)
    validation_results = Column(JSONB, default=dict)
    metadata_ = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("current_phase >= 0 AND current_phase <= 6", name="valid_phase"),
    )

    client = relationship("Client", back_populates="projects")
    audit_logs = relationship("AuditLog", back_populates="project", cascade="all, delete-orphan")
    grounding_records = relationship("GroundingRecord", back_populates="project", cascade="all, delete-orphan")
    pipeline_events = relationship("PipelineEvent", back_populates="project", cascade="all, delete-orphan")

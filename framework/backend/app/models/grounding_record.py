import uuid
from sqlalchemy import Column, String, Text, Integer, Float, DateTime, ForeignKey, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base


class GroundingRecord(Base):
    __tablename__ = "grounding_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"))
    agent_name = Column(String(100), nullable=False)
    query_path = Column(Text)
    cited_nodes = Column(JSONB, default=list)
    cited_edges = Column(JSONB, default=list)
    node_count = Column(Integer, default=0)
    grounding_score = Column(Float)
    response_summary = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("grounding_score >= 0 AND grounding_score <= 1", name="valid_grounding_score"),
    )

    project = relationship("Project", back_populates="grounding_records")

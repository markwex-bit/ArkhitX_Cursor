from sqlalchemy import Column, String, Text, Integer, Float, DateTime, func
from app.database import Base


class AgentPrompt(Base):
    __tablename__ = "agent_prompts"

    id = Column(String(100), primary_key=True)
    agent_name = Column(String(100), nullable=False)
    description = Column(Text)
    system_prompt = Column(Text, nullable=False)
    model = Column(String(100), default="claude-sonnet-4-20250514")
    max_tokens = Column(Integer, default=4096)
    temperature = Column(Float, default=0.3)
    application_slug = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

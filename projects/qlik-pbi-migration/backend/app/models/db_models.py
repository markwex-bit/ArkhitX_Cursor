"""
SQLAlchemy models — application data (sign-off records), not ArkhitX
governance data. Per the ArkhitX rule, governance/audit data belongs in
ArkhitX's own PostgreSQL once Phase 3 is wired; this is just the app's own
persistence for the human sign-off gate, using whatever DATABASE_URL is
configured (sqlite by default for standalone Phase 0 runs).
"""
from __future__ import annotations

import uuid

from sqlalchemy import Column, String
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from app.database import Base


class SignOffDB(Base):
    __tablename__ = "signoffs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    qlik_app_id = Column(String, nullable=False)
    pbi_dataset_id = Column(String, nullable=True)
    decision = Column(String, nullable=False)  # confirmed | overridden | needs_more_info
    reviewer = Column(String, nullable=False)
    notes = Column(String, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

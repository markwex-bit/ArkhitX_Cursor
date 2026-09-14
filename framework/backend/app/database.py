from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import (  # noqa: F401
        project, agent_prompt, audit_log, grounding_record, pipeline_event, client,
        architecture_document, architecture_decision,
    )
    Base.metadata.create_all(bind=engine)
    _migrate_agent_prompts()
    _migrate_project_architecture_columns()


def _migrate_project_architecture_columns():
    """
    Add Phase A (Architecture) columns to an existing `projects` table and
    widen the valid_phase check constraint to allow -1 (Architecture, before
    Phase 0 Build). Safe to run on every startup — every statement is
    idempotent.
    """
    with engine.connect() as conn:
        for stmt in (
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture_tier VARCHAR(20)",
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture_review_mode VARCHAR(20)",
            "ALTER TABLE projects ADD COLUMN IF NOT EXISTS as_built_notes TEXT",
        ):
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()

        # Set the phase check constraint to the canonical 7-stage range
        # (-1 Architecture .. 5 Ship, matching the Playbook's 0-5 phase model
        # plus Phase A). Postgres has no "ALTER CONSTRAINT" — drop and
        # recreate unconditionally so this stays correct even if an older
        # version of this migration already created a wider constraint.
        try:
            conn.execute(text("ALTER TABLE projects DROP CONSTRAINT IF EXISTS valid_phase"))
            conn.execute(text(
                "ALTER TABLE projects ADD CONSTRAINT valid_phase "
                "CHECK (current_phase >= -1 AND current_phase <= 5)"
            ))
            conn.commit()
        except Exception:
            conn.rollback()


def _migrate_agent_prompts():
    """Add application_slug column if missing and backfill existing rows."""
    with engine.connect() as conn:
        # Add column if it doesn't exist yet
        try:
            conn.execute(
                text("ALTER TABLE agent_prompts ADD COLUMN IF NOT EXISTS application_slug VARCHAR(100)")
            )
            conn.commit()
        except Exception:
            conn.rollback()

        # Backfill ArkhitX framework agents
        conn.execute(
            text("""
                UPDATE agent_prompts
                SET application_slug = 'arkhitx-framework'
                WHERE id LIKE 'arkhitx-%' AND application_slug IS NULL
            """)
        )
        # Backfill contract-review agents
        conn.execute(
            text("""
                UPDATE agent_prompts
                SET application_slug = 'contract-review'
                WHERE id LIKE 'contract%' AND application_slug IS NULL
            """)
        )
        conn.commit()

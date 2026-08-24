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
    from app.models import project, agent_prompt, audit_log, grounding_record, pipeline_event, client  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate_agent_prompts()


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

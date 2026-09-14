from __future__ import annotations

from functools import lru_cache

from app.config import get_settings


@lru_cache
def get_arkhitx_client():
    """Return a configured ArkhitXClient when Phase 3 env vars are set."""
    settings = get_settings()
    if not settings.arkhitx_database_url or not settings.arkhitx_project_id:
        return None

    try:
        from arkhitx import ArkhitXClient
    except ImportError:
        return None

    return ArkhitXClient(
        postgres_url=settings.arkhitx_database_url,
        neo4j_uri=settings.arkhitx_neo4j_uri or None,
        neo4j_user=settings.arkhitx_neo4j_user or None,
        neo4j_password=settings.arkhitx_neo4j_password or None,
        project_id=settings.arkhitx_project_id,
    )

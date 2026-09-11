from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    anthropic_api_key: str
    database_url:      str = "sqlite:///./app.db"
    cors_origins:      str = "http://localhost:3008"

    # ArkhitX governance — optional (leave blank for Phase 0 standalone)
    arkhitx_database_url: str = ""
    arkhitx_neo4j_uri:    str = ""
    arkhitx_neo4j_user:   str = "neo4j"
    arkhitx_neo4j_password: str = ""
    arkhitx_project_id:   str = ""

    # ── Data source: "sample" (default, safe) or "live" (real API calls) ────
    # See docs/LIVE-EXTRACTION-SETUP.md before switching this to "live".
    data_source: str = "sample"

    # ── Qlik Sense Enterprise (on-premises) — certificate-based auth ────────
    # Exported from QMC > System > Certificates > Export Certificates.
    qlik_server_url:       str = ""   # e.g. https://qlikserver.corp.local
    qlik_client_cert_path: str = ""   # client.pem
    qlik_client_key_path:  str = ""   # client_key.pem
    qlik_root_ca_path:     str = ""   # root.pem
    qlik_user_directory:   str = ""   # e.g. CORP
    qlik_user_id:          str = ""   # a QRS user with at least read-all content-admin rights
    qlik_virtual_proxy:    str = ""   # leave blank unless a non-default virtual proxy is required

    # ── Power BI — Azure AD service principal + Admin Scanner API ───────────
    # See docs/LIVE-EXTRACTION-SETUP.md for how to register/enable this app.
    pbi_tenant_id:     str = ""
    pbi_client_id:     str = ""
    pbi_client_secret: str = ""
    # Comma-separated workspace IDs to scan. Leave blank to auto-discover all
    # non-personal workspaces via /admin/workspaces/modified (slower, and may
    # miss workspaces with no activity in the lookback window).
    pbi_workspace_ids: str = ""

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    cors_origins: str = "http://localhost:3010"
    data_mode: str = "demo"  # demo | full
    samples_dir: str = str(ROOT / "samples")

    llm_provider: str = "none"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    azure_openai_endpoint: str = ""
    azure_openai_deployment: str = ""
    azure_openai_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = ""

    class Config:
        env_file = str(ROOT / ".env")
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()

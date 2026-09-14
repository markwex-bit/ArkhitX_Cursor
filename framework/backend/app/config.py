import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "ArkhitX Solution"
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    database_url: str = os.getenv(
        "DATABASE_URL", "postgresql://user:password@localhost:5432/arkhitx"
    )
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user: str = os.getenv("NEO4J_USER", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "password")

    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    claude_model: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5-20250929")
    claude_max_tokens: int = int(os.getenv("CLAUDE_MAX_TOKENS", "4096"))
    claude_temperature: float = float(os.getenv("CLAUDE_TEMPERATURE", "0.3"))

    jwt_secret: str = os.getenv("JWT_SECRET", "change-me-in-production")
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    cors_origins: list[str] = [
        o.strip()
        for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
    ]

    class Config:
        env_file = ".env"


settings = Settings()

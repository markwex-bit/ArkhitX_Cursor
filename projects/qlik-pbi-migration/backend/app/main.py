from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import init_db
from app.models import db_models  # noqa: F401 - ensures SignOffDB is registered on Base before init_db()
from app.api.pipeline import router as pipeline_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Qlik to Power BI Migration Assessor", version="0.1.0", lifespan=lifespan)
    origins = [o.strip() for o in settings.cors_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(pipeline_router, prefix="/api")

    @app.get("/health")
    def health():
        return {"status": "ok", "project": "Qlik to Power BI Migration Assessor"}

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

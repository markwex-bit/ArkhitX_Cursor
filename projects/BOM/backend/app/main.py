from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings
from app.services.costbook_engine import CostbookEngine
from app.services.data_store import init_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_store()
    engine = CostbookEngine()
    engine.build_index()
    engine._load_tpc_totals()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Costed BOM Comparison", version="0.1.0", lifespan=lifespan)
    origins = [o.strip() for o in settings.cors_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix="/api")
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8010, reload=True)

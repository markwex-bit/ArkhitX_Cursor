from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.graph import graph_service
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.governance import router as governance_router
from app.api.upload import router as upload_router
from app.api.applications import router as applications_router
from app.api.agents import router as agents_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    await graph_service.connect()
    yield
    await graph_service.close()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(governance_router, prefix="/api/governance", tags=["governance"])
app.include_router(upload_router, prefix="/api/upload", tags=["upload"])
app.include_router(applications_router, prefix="/api/applications", tags=["applications"])
app.include_router(agents_router, prefix="/api/agents", tags=["agents"])


@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.app_name}

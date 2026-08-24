#!/usr/bin/env python3
"""
new_project.py  —  Scaffold a new ArkhitX project.

Usage
-----
    python scripts/new_project.py <slug> [--name "Human Name"]

Examples
--------
    python scripts/new_project.py invoice-processor
    python scripts/new_project.py customer-churn --name "Customer Churn Predictor"

What it creates
---------------
    projects/<slug>/
        backend/
            app/
                agents/  base_agent.py   ← Claude-powered base, ArkhitX-aware
                api/     __init__.py
                models/  __init__.py
                services/__init__.py
                __init__.py
                config.py
                database.py
                main.py
            Dockerfile
            requirements.txt
        frontend/
            src/
                components/  Layout.tsx
                pages/       HomePage.tsx
                services/    api.ts
                types/       index.ts
                App.tsx
                index.css
                main.tsx
            index.html
            package.json
            tailwind.config.js
            vite.config.ts
            Dockerfile
        docs/
            README.md
            PHASE-0-BUILD.md
            PHASE-1-ONTOLOGY.md
            PHASE-2-GRAPH.md
            PHASE-3-GOVERNANCE.md
        ontology/    (empty, ready for <slug>.json)
        samples/     (empty, ready for sample data)
        scripts/
            01_register_project.py
            02_seed_graph.py
        .env
        .env.example
        docker-compose.yml
        README.md

Ports are auto-assigned from projects.json.
"""

import argparse
import json
import os
import sys
import textwrap
from datetime import date
from pathlib import Path

# ── Locate workspace root (one level up from this script) ─────────────────────
WORKSPACE = Path(__file__).parent.parent
REGISTRY  = WORKSPACE / "projects.json"


# ─────────────────────────────────────────────────────────────────────────────
# Port management
# ─────────────────────────────────────────────────────────────────────────────

def load_registry() -> dict:
    if not REGISTRY.exists():
        return {
            "_ports": {"next_frontend_port": 3004, "next_backend_port": 8004, "next_db_port": 5437},
            "projects": []
        }
    with open(REGISTRY) as f:
        return json.load(f)


def claim_ports(registry: dict) -> tuple[int, int, int]:
    p = registry["_ports"]
    fp, bp, dp = p["next_frontend_port"], p["next_backend_port"], p["next_db_port"]
    p["next_frontend_port"] += 1
    p["next_backend_port"]  += 1
    p["next_db_port"]       += 1
    return fp, bp, dp


def save_registry(registry: dict, slug: str, name: str, description: str,
                  fp: int, bp: int, dp: int) -> None:
    registry["projects"].append({
        "slug":        slug,
        "name":        name,
        "description": description,
        "created":     str(date.today()),
        "phase":       0,
        "ports":       {"frontend": fp, "backend": bp, "db": dp},
        "path":        f"projects/{slug}"
    })
    with open(REGISTRY, "w") as f:
        json.dump(registry, f, indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# File templates
# ─────────────────────────────────────────────────────────────────────────────

def render(template: str, **kw) -> str:
    """Simple {{KEY}} substitution."""
    for k, v in kw.items():
        template = template.replace("{{" + k + "}}", str(v))
    return template


# ── backend ───────────────────────────────────────────────────────────────────

BACKEND_MAIN = """\
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.database import init_db
# TODO: from app.api.your_router import router as your_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="{{NAME}}", version="0.1.0", lifespan=lifespan)
    origins = [o.strip() for o in settings.cors_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # TODO: app.include_router(your_router, prefix="/api")

    @app.get("/health")
    def health():
        return {"status": "ok", "project": "{{NAME}}"}

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
"""

BACKEND_CONFIG = """\
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    anthropic_api_key: str
    database_url:      str = "sqlite:///./app.db"
    cors_origins:      str = "http://localhost:{{FRONTEND_PORT}}"

    # ArkhitX governance — optional (leave blank for Phase 0 standalone)
    arkhitx_database_url: str = ""
    arkhitx_neo4j_uri:    str = ""
    arkhitx_neo4j_user:   str = "neo4j"
    arkhitx_neo4j_password: str = ""
    arkhitx_project_id:   str = ""

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()
"""

BACKEND_DATABASE = """\
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import get_settings

Base = declarative_base()

_engine = None

def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(get_settings().database_url)
    return _engine

def init_db():
    Base.metadata.create_all(bind=get_engine())

def get_db():
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
"""

BACKEND_BASE_AGENT = """\
import os
import json
from abc import ABC, abstractmethod
from anthropic import Anthropic
from app.config import get_settings

class BaseAgent(ABC):
    \"\"\"
    Claude-powered base agent.

    Phase 0  — calls Claude directly, no governance.
    Phase 3  — if ARKHITX_DATABASE_URL is set, wraps calls with grounding
               context from Neo4j and logs every call to the audit trail.
    \"\"\"

    def __init__(self):
        settings = get_settings()
        self._client = Anthropic(api_key=settings.anthropic_api_key)
        self._arkhitx = None

        if settings.arkhitx_database_url:
            try:
                from arkhitx import ArkhitXClient
                self._arkhitx = ArkhitXClient(
                    database_url=settings.arkhitx_database_url,
                    neo4j_uri=settings.arkhitx_neo4j_uri,
                    neo4j_user=settings.arkhitx_neo4j_user,
                    neo4j_password=settings.arkhitx_neo4j_password,
                )
            except ImportError:
                pass  # SDK not installed — run standalone

    @abstractmethod
    def get_system_prompt(self) -> str: ...

    @abstractmethod
    def process(self, data: dict) -> dict: ...

    # ── override in subclasses to enable KG grounding ─────────────────────────
    def _grounding_query(self, user_message: str) -> dict | None:
        return None

    def call_llm(self, user_message: str, system_prompt: str | None = None,
                 model: str = "claude-sonnet-4-5") -> str:
        system_prompt = system_prompt or self.get_system_prompt()
        grounding_data = None

        # Phase 3 — pre-call grounding
        if self._arkhitx:
            spec = self._grounding_query(user_message)
            if spec:
                grounding_data = self._arkhitx.get_grounding_context(**spec)
                if grounding_data:
                    context = json.dumps(grounding_data, indent=2)
                    system_prompt = (
                        f"{system_prompt}\\n\\n"
                        f"# Reference Data from Knowledge Graph\\n{context}"
                    )

        response = self._client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        text = response.content[0].text

        # Phase 3 — post-call audit + grounding score
        if self._arkhitx:
            audit_id = self._arkhitx.log_audit(
                project_id=os.getenv("ARKHITX_PROJECT_ID", ""),
                actor=self.__class__.__name__,
                action="call_llm",
                input_data={"user_message": user_message},
                output_data={"response": text},
                model=model,
                tokens_used=response.usage.input_tokens + response.usage.output_tokens,
            )
            if grounding_data:
                self._arkhitx.store_grounding(
                    audit_id=audit_id,
                    grounding_data=grounding_data,
                    response_text=text,
                )

        return text

    def call_llm_json(self, user_message: str, system_prompt: str | None = None) -> dict:
        text = self.call_llm(
            user_message,
            system_prompt=f"{system_prompt or self.get_system_prompt()}\\n\\nRespond with valid JSON only.",
        )
        # Strip markdown fences if present
        text = text.strip()
        if text.startswith("```"):
            text = "\\n".join(text.split("\\n")[1:])
            text = text.rsplit("```", 1)[0].strip()
        return json.loads(text)
"""

BACKEND_REQUIREMENTS = """\
fastapi==0.115.0
uvicorn[standard]==0.31.0
anthropic==0.40.0
sqlalchemy==2.0.36
pydantic-settings==2.5.2
python-multipart==0.0.12
httpx==0.27.2
# Uncomment for PostgreSQL:
# psycopg2-binary==2.9.10
# Uncomment for ArkhitX governance (Phase 3):
# arkhitx-sdk
"""

BACKEND_DOCKERFILE = """\
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# ArkhitX SDK (editable install from mounted volume)
RUN if [ -d /sdk ]; then pip install --no-cache-dir -e /sdk; fi
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
"""

# ── frontend ──────────────────────────────────────────────────────────────────

FRONTEND_PACKAGE_JSON = """\
{
  "name": "{{SLUG}}-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port {{FRONTEND_PORT}}",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "axios": "^1.7.7"
  },
  "devDependencies": {
    "@types/react": "^18.3.9",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.5.3",
    "vite": "^5.4.8"
  }
}
"""

FRONTEND_VITE_CONFIG = """\
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: {{FRONTEND_PORT}},
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:{{BACKEND_PORT}}',
        changeOrigin: true,
      },
    },
  },
})
"""

FRONTEND_INDEX_HTML = """\
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{NAME}}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
"""

FRONTEND_MAIN_TSX = """\
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
"""

FRONTEND_APP_TSX = """\
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* TODO: add your domain routes here */}
      </Routes>
    </Layout>
  )
}
"""

FRONTEND_LAYOUT_TSX = """\
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-900">{{NAME}}</h1>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
"""

FRONTEND_HOME_TSX = """\
export default function HomePage() {
  return (
    <div className="text-center py-20">
      <h2 className="text-3xl font-bold text-gray-800 mb-4">{{NAME}}</h2>
      <p className="text-gray-500">
        Your application is running. Replace this page with your domain UI.
      </p>
    </div>
  )
}
"""

FRONTEND_API_TS = """\
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

export default api

// TODO: add your API call functions here
// export const submitItem = (data: unknown) => api.post('/items', data)
"""

FRONTEND_TYPES_TS = """\
// TODO: add your TypeScript types here

export interface HealthResponse {
  status: string
  project: string
}
"""

FRONTEND_INDEX_CSS = """\
@tailwind base;
@tailwind components;
@tailwind utilities;
"""

FRONTEND_TAILWIND_CONFIG = """\
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
"""

FRONTEND_TSCONFIG = """\
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
"""

FRONTEND_TSCONFIG_NODE = """\
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
"""

FRONTEND_POSTCSS = """\
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
"""

FRONTEND_DOCKERFILE = """\
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE {{FRONTEND_PORT}}
CMD ["npm", "run", "dev"]
"""

# ── docker-compose ─────────────────────────────────────────────────────────────

DOCKER_COMPOSE = """\
##############################################################################
# {{NAME}}  —  docker-compose.yml
#
# Phase 0 (standalone):  docker-compose up --build
# Phase 3 (governed):    start infrastructure first, then docker-compose up
##############################################################################

networks:
  # Join ArkhitX shared network when infrastructure is running (Phase 3).
  # Comment this out if running fully standalone.
  arkhitx-network:
    external: true
    name: arkhitx-network

services:

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: {{DB_NAME}}
    ports:
      - "{{DB_PORT}}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d {{DB_NAME}}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    ports:
      - "{{BACKEND_PORT}}:8000"
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      DATABASE_URL: postgresql://user:password@db:5432/{{DB_NAME}}
      CORS_ORIGINS: http://localhost:{{FRONTEND_PORT}}

      # ── ArkhitX governance (Phase 3) ──────────────────────────────────────
      # Leave blank to run standalone (Phase 0 behaviour).
      # Fill in after running scripts/01_register_project.py.
      ARKHITX_DATABASE_URL: ${ARKHITX_DATABASE_URL:-}
      ARKHITX_NEO4J_URI: ${ARKHITX_NEO4J_URI:-}
      ARKHITX_NEO4J_USER: ${ARKHITX_NEO4J_USER:-neo4j}
      ARKHITX_NEO4J_PASSWORD: ${ARKHITX_NEO4J_PASSWORD:-}
      ARKHITX_PROJECT_ID: ${ARKHITX_PROJECT_ID:-}

    depends_on:
      db:
        condition: service_healthy
    networks:
      - default
      - arkhitx-network
    volumes:
      - ./backend:/app
      - ../../framework/sdk:/sdk   # ArkhitX SDK (editable install)

  frontend:
    build: ./frontend
    ports:
      - "{{FRONTEND_PORT}}:{{FRONTEND_PORT}}"
    environment:
      VITE_API_URL: ""
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  pgdata:
"""

# ── env files ─────────────────────────────────────────────────────────────────

DOT_ENV_EXAMPLE = """\
# {{NAME}} — environment variables
# Copy to .env and fill in values.

ANTHROPIC_API_KEY=sk-ant-...

# ArkhitX Governance (Phase 3) — leave blank to run standalone
# Fill in after running: python projects/{{SLUG}}/scripts/01_register_project.py
ARKHITX_DATABASE_URL=
ARKHITX_NEO4J_URI=
ARKHITX_NEO4J_USER=neo4j
ARKHITX_NEO4J_PASSWORD=
ARKHITX_PROJECT_ID=
"""

# ── docs stubs ────────────────────────────────────────────────────────────────

DOCS_README = """\
# {{NAME}}

> Phase documentation for the {{NAME}} ArkhitX project.

| File                 | Phase | Contents                              |
|----------------------|-------|---------------------------------------|
| PHASE-0-BUILD.md     | 0     | What was built and key decisions      |
| PHASE-1-ONTOLOGY.md  | 1     | Ontology schema and registration      |
| PHASE-2-GRAPH.md     | 2     | Knowledge graph seeding               |
| PHASE-3-GOVERNANCE.md| 3     | ArkhitX wiring and validation         |
"""

DOCS_PHASE_0 = """\
# Phase 0 — Build

## What Was Built

<!-- Describe the core application: what agents exist, what the UI does, what the DB stores -->

## Key Design Decisions

<!-- Why did you choose these agents? What does each one do? -->

## How to Run (Standalone)

```bash
cd projects/{{SLUG}}
docker-compose up --build
```

Open http://localhost:{{FRONTEND_PORT}}
"""

DOCS_PHASE_1 = """\
# Phase 1 — Ontology

## Domain Model

<!-- Describe the entities and relationships in the ontology JSON -->

## Registration

```bash
python projects/{{SLUG}}/scripts/01_register_project.py
```

After running, copy `ARKHITX_PROJECT_ID` into your `.env` file.
"""

DOCS_PHASE_2 = """\
# Phase 2 — Knowledge Graph

## What Was Seeded

<!-- Describe what nodes and relationships were created in Neo4j -->

## Seed Command

```bash
python projects/{{SLUG}}/scripts/02_seed_graph.py
```

## Verify in Neo4j Browser

Open http://localhost:7474 and run:
```cypher
MATCH (n) RETURN n LIMIT 50
```
"""

DOCS_PHASE_3 = """\
# Phase 3 — Governance

## What Was Wired

<!-- Describe which agents implement _grounding_query() and what they query -->

## Enabling Governance

1. Start ArkhitX infrastructure: `cd infrastructure && docker-compose up -d`
2. Register project: `python projects/{{SLUG}}/scripts/01_register_project.py`
3. Seed graph: `python projects/{{SLUG}}/scripts/02_seed_graph.py`
4. Add `ARKHITX_*` values to `.env`
5. Restart project: `docker-compose up --build`

## Validating

Check the ArkhitX Dashboard at http://localhost:8090.
Every agent call should appear in the Audit Log with a grounding score.
"""

# ── scripts ───────────────────────────────────────────────────────────────────

SCRIPT_REGISTER = """\
#!/usr/bin/env python3
\"\"\"
Phase 1 — Register {{NAME}} with ArkhitX.

Run after starting infrastructure:
    cd infrastructure && docker-compose up -d
    python projects/{{SLUG}}/scripts/01_register_project.py
\"\"\"
import json
import os
import sys
from pathlib import Path

# Add SDK to path
sdk_path = Path(__file__).parent.parent.parent.parent / "framework" / "sdk"
if sdk_path.exists():
    sys.path.insert(0, str(sdk_path))

from arkhitx import ArkhitXClient

def main():
    db_url = os.environ.get("ARKHITX_DATABASE_URL") or input(
        "ARKHITX_DATABASE_URL [postgresql://user:password@localhost:5432/arkhitx]: "
    ).strip() or "postgresql://user:password@localhost:5432/arkhitx"

    neo4j_uri = os.environ.get("ARKHITX_NEO4J_URI", "bolt://localhost:7687")

    client = ArkhitXClient(
        database_url=db_url,
        neo4j_uri=neo4j_uri,
        neo4j_user=os.environ.get("ARKHITX_NEO4J_USER", "neo4j"),
        neo4j_password=os.environ.get("ARKHITX_NEO4J_PASSWORD", "password"),
    )

    ontology_path = Path(__file__).parent.parent / "ontology" / "{{SLUG}}.json"
    if not ontology_path.exists():
        print(f"Ontology not found at {ontology_path}. Create it first.")
        sys.exit(1)

    with open(ontology_path) as f:
        ontology = json.load(f)

    project_id = client.register_project(
        name="{{NAME}}",
        description=ontology.get("description", ""),
        ontology=ontology,
    )

    print(f"\\n✅ Project registered successfully!")
    print(f"   ARKHITX_PROJECT_ID={project_id}")
    print(f"\\nAdd this to your .env file and restart the project.")

if __name__ == "__main__":
    main()
"""

SCRIPT_SEED = """\
#!/usr/bin/env python3
\"\"\"
Phase 2 — Seed the Neo4j knowledge graph for {{NAME}}.

Run after Phase 1 registration:
    python projects/{{SLUG}}/scripts/02_seed_graph.py

TODO: Replace the sample nodes below with real domain knowledge.
\"\"\"
import os
import sys
from pathlib import Path

sdk_path = Path(__file__).parent.parent.parent.parent / "framework" / "sdk"
if sdk_path.exists():
    sys.path.insert(0, str(sdk_path))

from arkhitx import ArkhitXClient, GraphPopulator

def main():
    db_url   = os.environ.get("ARKHITX_DATABASE_URL", "postgresql://user:password@localhost:5432/arkhitx")
    neo4j_uri = os.environ.get("ARKHITX_NEO4J_URI", "bolt://localhost:7687")

    client = ArkhitXClient(
        database_url=db_url,
        neo4j_uri=neo4j_uri,
        neo4j_user=os.environ.get("ARKHITX_NEO4J_USER", "neo4j"),
        neo4j_password=os.environ.get("ARKHITX_NEO4J_PASSWORD", "password"),
    )

    populator = GraphPopulator(client)

    # TODO: Replace with real domain nodes for {{NAME}}
    sample_nodes = [
        {
            "label":      "ExampleEntity",
            "properties": {"id": "example-001", "name": "Example Node", "description": "Replace with real data."}
        },
    ]

    for node in sample_nodes:
        populator.create_node(label=node["label"], properties=node["properties"])
        print(f"  Created {node['label']}: {node['properties']['id']}")

    print(f"\\n✅ Seeded {len(sample_nodes)} nodes into Neo4j.")
    print("   Update this script with real domain knowledge before Phase 3.")

if __name__ == "__main__":
    main()
"""

# ── README ────────────────────────────────────────────────────────────────────

README = """\
# {{NAME}}

> An ArkhitX-governed AI application.

## What It Does

<!-- TODO: describe what this application does and who uses it -->

## Quick Start

```bash
# 1. Add your Anthropic API key
cp .env.example .env
# Edit .env and add: ANTHROPIC_API_KEY=sk-ant-...

# 2. Build and run
docker-compose up --build
```

- Frontend: http://localhost:{{FRONTEND_PORT}}
- Backend API: http://localhost:{{BACKEND_PORT}}
- API Docs: http://localhost:{{BACKEND_PORT}}/docs

## Agents

| Agent | File | What It Does |
|-------|------|--------------|
| TODO  | `backend/app/agents/` | Add your agents here |

## Phase Roadmap

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Build | ✅ Scaffolded | Add domain logic |
| 1 — Register | ⏳ Pending | Create `ontology/{{SLUG}}.json` first |
| 2 — Populate | ⏳ Pending | Update `scripts/02_seed_graph.py` |
| 3 — Governance | ⏳ Pending | Wire after Phase 2 complete |

## ArkhitX Governance (Phase 3)

When ready to add governance:

```bash
# Start shared infrastructure
cd ../../infrastructure && docker-compose up -d

# Register this project
python scripts/01_register_project.py

# Seed the knowledge graph
python scripts/02_seed_graph.py

# Add ARKHITX_* values to .env, then restart
docker-compose up --build
```

See `docs/` for full phase documentation.
"""

# ─────────────────────────────────────────────────────────────────────────────
# File creation helpers
# ─────────────────────────────────────────────────────────────────────────────

def write(path: Path, content: str, **kw) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render(content, **kw), encoding="utf-8")
    print(f"  ✓ {path.relative_to(WORKSPACE)}")


def touch(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.touch()
    print(f"  ✓ {path.relative_to(WORKSPACE)}")


# ─────────────────────────────────────────────────────────────────────────────
# Scaffold
# ─────────────────────────────────────────────────────────────────────────────

def scaffold(slug: str, name: str, fp: int, bp: int, dp: int) -> None:
    db_name = slug.replace("-", "").replace("_", "")
    root    = WORKSPACE / "projects" / slug

    if root.exists():
        print(f"Error: projects/{slug}/ already exists. Choose a different slug.")
        sys.exit(1)

    kw = dict(SLUG=slug, NAME=name, FRONTEND_PORT=fp,
              BACKEND_PORT=bp, DB_PORT=dp, DB_NAME=db_name)

    print(f"\nScaffolding '{name}' in projects/{slug}/ ...\n")

    # backend
    write(root / "backend/app/__init__.py",          "", **kw)
    write(root / "backend/app/main.py",              BACKEND_MAIN, **kw)
    write(root / "backend/app/config.py",            BACKEND_CONFIG, **kw)
    write(root / "backend/app/database.py",          BACKEND_DATABASE, **kw)
    write(root / "backend/app/agents/__init__.py",   "", **kw)
    write(root / "backend/app/agents/base_agent.py", BACKEND_BASE_AGENT, **kw)
    write(root / "backend/app/api/__init__.py",      "", **kw)
    write(root / "backend/app/models/__init__.py",   "", **kw)
    write(root / "backend/app/services/__init__.py", "", **kw)
    write(root / "backend/requirements.txt",         BACKEND_REQUIREMENTS, **kw)
    write(root / "backend/Dockerfile",               BACKEND_DOCKERFILE, **kw)

    # frontend
    write(root / "frontend/src/main.tsx",                   FRONTEND_MAIN_TSX, **kw)
    write(root / "frontend/src/App.tsx",                    FRONTEND_APP_TSX, **kw)
    write(root / "frontend/src/index.css",                  FRONTEND_INDEX_CSS, **kw)
    write(root / "frontend/src/components/Layout.tsx",      FRONTEND_LAYOUT_TSX, **kw)
    write(root / "frontend/src/pages/HomePage.tsx",         FRONTEND_HOME_TSX, **kw)
    write(root / "frontend/src/services/api.ts",            FRONTEND_API_TS, **kw)
    write(root / "frontend/src/types/index.ts",             FRONTEND_TYPES_TS, **kw)
    write(root / "frontend/index.html",                     FRONTEND_INDEX_HTML, **kw)
    write(root / "frontend/package.json",                   FRONTEND_PACKAGE_JSON, **kw)
    write(root / "frontend/vite.config.ts",                 FRONTEND_VITE_CONFIG, **kw)
    write(root / "frontend/tsconfig.json",                  FRONTEND_TSCONFIG, **kw)
    write(root / "frontend/tsconfig.node.json",             FRONTEND_TSCONFIG_NODE, **kw)
    write(root / "frontend/tailwind.config.js",             FRONTEND_TAILWIND_CONFIG, **kw)
    write(root / "frontend/postcss.config.js",              FRONTEND_POSTCSS, **kw)
    write(root / "frontend/Dockerfile",                     FRONTEND_DOCKERFILE, **kw)

    # infra
    write(root / "docker-compose.yml",  DOCKER_COMPOSE, **kw)
    write(root / ".env.example",        DOT_ENV_EXAMPLE, **kw)
    write(root / ".env",                DOT_ENV_EXAMPLE.replace("sk-ant-...", ""), **kw)

    # docs
    write(root / "docs/README.md",           DOCS_README, **kw)
    write(root / "docs/PHASE-0-BUILD.md",    DOCS_PHASE_0, **kw)
    write(root / "docs/PHASE-1-ONTOLOGY.md", DOCS_PHASE_1, **kw)
    write(root / "docs/PHASE-2-GRAPH.md",    DOCS_PHASE_2, **kw)
    write(root / "docs/PHASE-3-GOVERNANCE.md", DOCS_PHASE_3, **kw)

    # ontology, samples, scripts
    touch(root / "ontology" / ".gitkeep")
    touch(root / "samples"  / ".gitkeep")
    write(root / "scripts/01_register_project.py", SCRIPT_REGISTER, **kw)
    write(root / "scripts/02_seed_graph.py",        SCRIPT_SEED, **kw)

    # README
    write(root / "README.md", README, **kw)


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scaffold a new ArkhitX project.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              python scripts/new_project.py invoice-processor
              python scripts/new_project.py customer-churn --name "Customer Churn Predictor"
        """),
    )
    parser.add_argument("slug",   help="URL-safe project identifier (e.g. invoice-processor)")
    parser.add_argument("--name", help="Human-readable name (default: title-cased slug)")
    args = parser.parse_args()

    slug = args.slug.lower().replace(" ", "-")
    name = args.name or slug.replace("-", " ").title()

    registry = load_registry()

    existing = [p["slug"] for p in registry.get("projects", [])]
    if slug in existing:
        print(f"Error: '{slug}' is already registered in projects.json.")
        sys.exit(1)

    fp, bp, dp = claim_ports(registry)

    scaffold(slug, name, fp, bp, dp)
    save_registry(registry, slug, name, f"AI application: {name}", fp, bp, dp)

    print(f"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  {name}  scaffolded!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📁  projects/{slug}/

  Frontend  →  http://localhost:{fp}
  API       →  http://localhost:{bp}
  API docs  →  http://localhost:{bp}/docs

  Next steps
  ──────────
  1. Add your ANTHROPIC_API_KEY to projects/{slug}/.env
  2. Build your agents in  projects/{slug}/backend/app/agents/
  3. Build your UI pages in projects/{slug}/frontend/src/pages/
  4. Run:  cd projects/{slug} && docker-compose up --build

  When Phase 0 is working, open docs/PHASE-1-ONTOLOGY.md
  to begin ArkhitX governance integration.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")


if __name__ == "__main__":
    main()

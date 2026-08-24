# ArkhitX Workspace Architecture — Why It's Structured This Way

## The Core Problem This Structure Solves

When you build AI applications with a governance framework, you have two fundamentally
different kinds of code living in the same workspace:

1. **Framework code** — the infrastructure that governs *any* solution (ArkhitX itself)
2. **Project code** — the solution that solves a specific business problem

If these two things share the same directory level, they become tangled. A new developer
can't tell what belongs to ArkhitX and what belongs to the project they're working on.
The AI (Cursor) can't tell either, and will make incorrect assumptions about where things
should go.

This structure solves that by making the separation **physical, not just conceptual.**

---

## The Structure

```
ArkhitX_Cursor/
│
├── framework/               ← ArkhitX (the infrastructure)
│   ├── backend/             ← Governance API
│   ├── frontend/            ← Governance dashboard
│   ├── sdk/                 ← Python SDK any project installs
│   └── docs/                ← Methodology documentation
│
├── infrastructure/          ← How to run the framework
│   └── docker-compose.yml
│
├── scripts/                 ← Workspace-level utilities
│   └── new_project.py
│
├── projects/                ← All solutions (the work)
│   ├── contract-review/
│   ├── incident-classifier/
│   ├── hr-policy-qa/
│   └── supplier-risk/
│
├── projects.json            ← Registry
└── WORKSPACE.md             ← Entry point
```

---

## The Three Separation Principles

### 1. Framework vs. Project

`framework/` contains code you do not touch when building a new project.
`projects/` contains code you write fresh every time.

This is the same principle used in mature software ecosystems everywhere:

| Ecosystem      | Framework (don't touch) | Project (write here)      |
|----------------|-------------------------|---------------------------|
| React          | `node_modules/react/`   | `src/`                    |
| Django         | `django/` (installed)   | `myapp/`                  |
| Spring Boot    | Spring JARs             | `src/main/java/`          |
| **ArkhitX**    | `framework/`            | `projects/{slug}/`        |

The user of a framework should never need to open the framework's source code to
build something with it. The boundary must be visible in the folder structure.

### 2. Infrastructure vs. Application

`infrastructure/` is how you *start* the shared services.
`projects/{slug}/docker-compose.yml` is how you *start* a specific application.

These are different concerns:

- Infrastructure is started **once** and stays running — it serves all projects.
- A project is started **per task** — you bring up one project at a time.

Mixing them in the same docker-compose file would mean every project restart
also restarts the shared database, breaking every other running project.

### 3. Self-Contained Projects

Every project under `projects/` is **fully portable**. You can hand the folder
to someone with no knowledge of ArkhitX and they can run it standalone (Phase 0).

```
projects/contract-review/
├── backend/         ← complete FastAPI application
├── frontend/        ← complete React application
├── docs/            ← all phase documentation
├── ontology/        ← domain schema
├── scripts/         ← registration and graph seeding
├── samples/         ← example input data
├── .env             ← all environment variables
├── docker-compose.yml
└── README.md
```

Nothing about this project lives outside this folder. If you deleted every other
folder in the workspace, this project would still run.

This is the **strangler fig pattern** applied to governance: the project works
first, governance wraps around it later — and the project can always survive
without it.

---

## Why Not Flatten It?

The alternative is a flat structure where everything lives at the root:

```
ArkhitX_Cursor/         ← the anti-pattern
├── backend/            ← is this ArkhitX or a project?
├── frontend/           ← which frontend?
├── sdk/
├── Docs/
├── contract-review/    ← a project?
├── incident-classifier/
└── docker-compose.yml  ← runs what exactly?
```

**Problems with the flat structure:**

- A new developer opens the project and has no mental model of what belongs where.
- Cursor AI has no structural signal — it treats all folders as equally likely
  places to write new code, leading to files ending up in the wrong location.
- You cannot give someone "just the contract-review project" — it has hidden
  dependencies scattered at the root.
- Port conflicts are invisible until you try to run two things at once.
- There is no obvious place to put a new project.

---

## The Registry Pattern (`projects.json`)

```json
{
  "_ports": {
    "next_frontend_port": 3004,
    "next_backend_port":  8004,
    "next_db_port":       5437
  },
  "projects": [
    {
      "slug":  "contract-review",
      "ports": { "frontend": 3000, "backend": 8000, "db": 5433 },
      "phase": 1
    }
  ]
}
```

Without a registry, port conflicts are discovered at runtime — the worst possible
time. The registry makes every project's ports explicit and auto-increments them
on creation. It also gives the workspace a single source of truth for:

- What projects exist
- What phase each project is in
- Where each project lives
- What ports it occupies

This is the same idea as a `package.json` for a Node.js workspace or a
`pyproject.toml` for a Python monorepo — a manifest that describes what's here.

---

## The Scaffold Script (`scripts/new_project.py`)

A scaffold script enforces structure. When the structure lives only in
documentation, it degrades over time — someone creates a project slightly
differently, then the next person copies that, and the structure diverges.

When the structure is enforced by a script, every project is identical in
shape. Only the domain logic differs.

```bash
python scripts/new_project.py invoice-processor --name "Invoice Processor"
```

This guarantees:
- Correct directory layout
- Correct port assignment (no conflicts)
- Correct ArkhitX network wiring
- Phase documentation stubs created
- Registry updated
- `.env` ready to fill in

The human's first action is always the same: add an `ANTHROPIC_API_KEY`.
Everything else is already in place.

---

## The Network Design

Each project's `docker-compose.yml` declares the ArkhitX shared network as
**external** — meaning it was created by someone else and is joined, not owned:

```yaml
networks:
  arkhitx-network:
    external: true      # ← I did not create this, I am joining it
    name: arkhitx-network
```

The backend service then connects to both its own internal network and the
shared ArkhitX network:

```yaml
backend:
  networks:
    - default           # ← talks to its own db
    - arkhitx-network   # ← talks to ArkhitX postgres and neo4j
```

**Why this matters:** When `ARKHITX_DATABASE_URL` is not set, the backend
ignores the ArkhitX network entirely — it runs as if the network were not
there. When the variable is set, the backend seamlessly connects to ArkhitX
services without any docker-compose changes.

Governance is activated by configuration, not by restructuring.

---

## The Phase Model

The four-phase structure is not just documentation — it is an *architectural
commitment*. It says: a project is always in one of four known states, and
the transition between states has defined steps.

```
Phase 0 → Phase 1 → Phase 2 → Phase 3
  Build    Register   Seed      Wire
```

This matters because it means:

- You can ship Phase 0 immediately — it works with just an API key.
- You add governance incrementally — never a full rewrite.
- You can stop at any phase — the project continues to work.
- Every project in the workspace is comparable — you can see which phase
  each one is at from `projects.json`.

Most governance frameworks fail because they require you to design governance
before you know what you are building. This structure inverts that. You build
first, then extract the ontology from the working code, then add governance.
The structure supports this by making Phase 0 the default state.

---

## Summary

| Decision                           | Why                                                          |
|------------------------------------|--------------------------------------------------------------|
| `framework/` is separate           | You never touch the framework when building a project        |
| `infrastructure/` is separate      | Shared services have different lifecycle than applications   |
| Projects are self-contained        | Portable, standalone, no hidden root-level dependencies      |
| `projects.json` registry           | Single source of truth for ports, phases, and locations      |
| Scaffold script enforces structure  | Structure degrades without enforcement                       |
| External Docker network            | Governance activates via config, not via restructuring       |
| Phase model is explicit            | Every project has a known state; transitions have clear steps|

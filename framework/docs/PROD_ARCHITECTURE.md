# ArkhitX — Production Architecture

**Document type:** Architecture Decision Record  
**Audience:** Solutions architects, DevOps engineers, technical leads  
**Status:** Recommended

---

## Overview

This document defines the recommended production architecture for deploying
ArkhitX and the AI applications it governs. It covers infrastructure topology,
networking, secrets management, CI/CD, and the key decisions that separate a
production deployment from the development Docker Compose setup.

---

## Core Principle: One ArkhitX, Many Applications

ArkhitX is **shared governance infrastructure** — analogous to a centralised
logging platform or an identity provider. It is deployed once, in a central
location, and every governed application connects to it regardless of where
those applications are deployed.

Multi-tenancy is built in. A `project_id` scopes every audit log, grounding
record, and agent prompt to its application. A single ArkhitX instance can
govern any number of applications simultaneously.

**Applications do not need to be on the same server as ArkhitX.** The SDK
connects via database connection strings. As long as an application container
can reach the PostgreSQL and Neo4j endpoints over a private network, governance
flows. This is RULE-004 (Independence) in practice: the application runs
standalone; ArkhitX adds trust via network connection.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      ArkhitX Platform                           │
│                   (Central Shared Service)                      │
│                                                                 │
│  ┌──────────────────┐  ┌───────────────┐  ┌─────────────────┐  │
│  │  PostgreSQL       │  │    Neo4j      │  │  ArkhitX API    │  │
│  │  (Governance DB)  │  │  (Graph DB)   │  │  + Dashboard    │  │
│  │  Managed RDS /    │  │  AuraDB or    │  │  Fargate /      │  │
│  │  Azure DB / CDB   │  │  Dedicated VM │  │  App Service    │  │
│  └──────────────────┘  └───────────────┘  └─────────────────┘  │
│                                                                 │
│  Private subnet — no public endpoints                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │  Private network
                           │  (VPC Peering / VNet Peering / VPN)
         ┌─────────────────┼──────────────────────┐
         │                 │                      │
┌────────▼──────┐  ┌───────▼───────┐  ┌──────────▼──────┐
│ Contract      │  │ HR Policy     │  │ Supplier Risk   │
│ Review        │  │ Q&A           │  │ Assessor        │
│               │  │               │  │                 │
│ ECS Fargate   │  │ Cloud Run     │  │ App Service     │
│ FastAPI API   │  │ FastAPI API   │  │ FastAPI API     │
│ React (CDN)   │  │ React (CDN)   │  │ React (CDN)     │
│ Own app DB    │  │ Own app DB    │  │ Own app DB      │
└───────────────┘  └───────────────┘  └─────────────────┘

Each application connects to ArkhitX via:
  ARKHITX_DATABASE_URL  →  PostgreSQL private endpoint
  ARKHITX_NEO4J_URI     →  Neo4j private endpoint
  ARKHITX_PROJECT_ID    →  UUID assigned at registration
```

---

## Tier 1 — ArkhitX Platform

Deploy once. Shared across all governed applications.

### PostgreSQL (Governance Database)

Use a managed relational database service. Do not run PostgreSQL in a container
in production.

| Cloud | Recommended Service |
|---|---|
| AWS | RDS for PostgreSQL — Multi-AZ deployment |
| Azure | Azure Database for PostgreSQL — Flexible Server |
| GCP | Cloud SQL for PostgreSQL |

**Configuration:**
- Multi-AZ or zone-redundant for high availability
- Automated daily backups with point-in-time recovery (minimum 7-day retention)
- Private subnet only — no public endpoint
- TLS enforced for all connections
- The `arkhitx` database is low-volume (audit writes, grounding records,
  prompt reads); a small instance (2 vCPU, 4 GB RAM) is sufficient for most
  deployments

### Neo4j (Knowledge Graph)

Two options depending on operational preference:

**Option A — AuraDB (recommended for most deployments)**
- Neo4j's fully managed cloud service
- Zero operational overhead, automatic backups, APOC available
- Free tier supports small knowledge graphs; paid tiers scale linearly
- Connect via `bolt+s://` (TLS by default)

**Option B — Self-hosted on a dedicated VM**
- Required if you need custom plugins beyond APOC, or air-gapped environments
- Minimum: 4 vCPU, 8 GB RAM, SSD storage
- Use the official Neo4j Docker image or Helm chart for Kubernetes
- Configure `neo4j.conf` for bolt TLS and disable HTTP interface in production

### ArkhitX API

The ArkhitX FastAPI backend is stateless. It reads from and writes to
PostgreSQL and Neo4j; it holds no in-memory state between requests.

- Deploy as a container (Docker image built from `framework/backend/`)
- Host on a container platform: AWS ECS/Fargate, Azure Container Apps, GCP
  Cloud Run, or any Kubernetes cluster
- A single small instance handles governance traffic comfortably under normal
  load (governance calls are low-frequency compared to application LLM calls)
- Place behind an **internal** load balancer — the API should not be publicly
  accessible
- Health check endpoint: `GET /health`

### ArkhitX Dashboard

The React frontend is a static single-page application built from
`framework/frontend/`.

- Build with `npm run build` and deploy the `dist/` output to a CDN:
  - AWS: S3 bucket + CloudFront distribution
  - Azure: Azure Static Web Apps
  - GCP: Cloud Storage + Cloud CDN
- Alternatively, serve it from the same container as the API (simpler for
  smaller deployments)
- **Access control:** The Dashboard should be restricted to consultants and
  administrators. Gate it with your organisation's identity provider (SSO via
  OIDC/SAML) or place it behind a VPN — it must not be publicly accessible

---

## Tier 2 — Applications

Each application is deployed independently. It has no dependency on the ArkhitX
containers — only on the database endpoints.

### Deployment targets

| Workload | Recommended Host |
|---|---|
| FastAPI backend (long-running) | AWS ECS/Fargate, Azure Container Apps, GCP Cloud Run |
| React / Next.js frontend | S3+CloudFront, Azure Static Web Apps, Vercel |
| Background workers (Celery) | Same container platform as API, or dedicated queue workers |
| Scheduled batch jobs | ECS Scheduled Tasks, Azure Container Instances, Cloud Run Jobs |

### What each application needs

Each application container requires three ArkhitX environment variables injected
at runtime (from a secrets vault — see Secrets Management below):

```
ARKHITX_DATABASE_URL=postgresql://user:password@arkhitx-pg.internal:5432/arkhitx
ARKHITX_NEO4J_URI=bolt://arkhitx-neo4j.internal:7687
ARKHITX_PROJECT_ID=<uuid assigned during Phase 1 registration>
```

Plus its own application database connection string — separate from the ArkhitX
governance database. Application data (contracts, policy documents, incidents,
suppliers) must never be written to the ArkhitX PostgreSQL instance.

### Application independence (RULE-004)

When `ARKHITX_DATABASE_URL` is not set, the SDK falls back to local prompt
files and skips audit logging. The application continues to function. This is
by design — ArkhitX adds governance, not functionality. Applications can be
deployed and tested without the ArkhitX platform running.

---

## Tier 3 — Networking

Networking is the most important production concern. Audit logs contain
sensitive information about AI decision-making; this data must never traverse
the public internet.

### Same-cloud deployment (recommended)

All applications and the ArkhitX platform are in the same cloud provider.

**AWS:**
- ArkhitX platform in a dedicated VPC (e.g. `arkhitx-vpc`, CIDR `10.0.0.0/16`)
- Each application in its own VPC (e.g. `contract-review-vpc`, `10.1.0.0/16`)
- Connect via **VPC Peering** or **AWS Transit Gateway** (Transit Gateway
  preferred when managing five or more application VPCs)
- RDS and Neo4j EC2 in private subnets with no internet gateway
- Security groups: allow inbound on port 5432 (PostgreSQL) and 7687 (Neo4j)
  only from application VPC CIDR ranges

**Azure:**
- ArkhitX platform in a Hub VNet
- Applications in Spoke VNets
- Connect via **VNet Peering** with Azure Private Endpoints for PostgreSQL
  and Neo4j

### Cross-cloud or on-premises applications

If an application is deployed on a different cloud provider or on-premises:

1. **Site-to-site VPN** — encrypted tunnel between networks; suitable for
   moderate traffic volumes
2. **Private circuit** — AWS Direct Connect or Azure ExpressRoute for
   high-throughput or compliance-sensitive deployments
3. **mTLS over public internet** — acceptable for low-sensitivity use cases;
   requires mutual TLS between application and database, plus IP allowlisting

---

## Secrets Management

API keys, database credentials, and project IDs must never be stored in
`.env` files, Docker Compose definitions, or source code in production.

| Cloud | Service | How to inject |
|---|---|---|
| AWS | Secrets Manager or Parameter Store | ECS Task Definition `secrets` block — injected as env vars at container start |
| Azure | Key Vault with Managed Identity | Container Apps secrets reference — no credential in config |
| GCP | Secret Manager | Cloud Run `--set-secrets` flag |
| Kubernetes | External Secrets Operator | Syncs from any vault provider to Kubernetes Secrets |

**Secrets to manage per application:**

```
ANTHROPIC_API_KEY
ARKHITX_DATABASE_URL
ARKHITX_NEO4J_URI
ARKHITX_PROJECT_ID
DATABASE_URL              (application's own DB)
```

**Secrets to manage for the ArkhitX platform:**

```
ANTHROPIC_API_KEY
DATABASE_URL              (points to governance PostgreSQL)
NEO4J_URI / NEO4J_PASSWORD
JWT_SECRET                (if Dashboard uses token auth)
```

---

## CI/CD

Each component has its own independent pipeline. Nothing is deployed together.

### ArkhitX Platform pipeline

```
1. Run database migrations
   alembic upgrade head  (or direct SQL against RDS)

2. Build ArkhitX API container
   docker build -t arkhitx-api:$VERSION framework/backend/

3. Push to container registry
   ECR / ACR / Artifact Registry

4. Deploy to container platform
   aws ecs update-service --force-new-deployment

5. Build and deploy Dashboard
   npm run build  →  aws s3 sync dist/ s3://arkhitx-dashboard/
   aws cloudfront create-invalidation --paths "/*"
```

### Application pipeline

```
1. Build application container
   docker build -t contract-review-api:$VERSION .

2. Push to container registry

3. Deploy to container platform
   (Inject ARKHITX_* env vars from Secrets Manager at deploy time)

4. Run smoke test
   curl https://contract-review.internal/health

5. Register with ArkhitX (first deploy only)
   POST /api/applications/contract-review/register
```

Applications deploy completely independently of ArkhitX. A new application
can be registered into ArkhitX from its own pipeline using the registration
API, without any manual steps in the Dashboard.

### SDK versioning

The `arkhitx-sdk` package must be versioned and pinned in each application's
`requirements.txt`. Use one of:

- **Private PyPI index** (AWS CodeArtifact, Azure Artifacts, GCP Artifact
  Registry) — publish tagged releases of `framework/sdk/`
- **Git dependency with tag:** `arkhitx-sdk @ git+https://github.com/org/arkhitx.git@v1.2.0#subdirectory=framework/sdk`

Never let applications pull the SDK from an unversioned path. A change to the
SDK should be a deliberate version bump with a changelog entry.

---

## High Availability and Disaster Recovery

| Component | HA Mechanism | RTO | RPO |
|---|---|---|---|
| PostgreSQL (RDS Multi-AZ) | Automatic failover to standby replica | < 60 seconds | Near zero (synchronous replication) |
| Neo4j (AuraDB) | Managed by Neo4j; causal clustering | < 5 minutes | Near zero |
| ArkhitX API | Multiple container instances behind load balancer | Immediate (stateless) | N/A |
| ArkhitX Dashboard | CDN-served static files | Immediate | N/A |
| Applications | Multiple container instances behind load balancer | Immediate (stateless) | N/A |

**Backup policy:**
- PostgreSQL: automated daily snapshots + continuous WAL archiving (RDS default)
- Neo4j: AuraDB automated backups; or daily Neo4j dump for self-hosted
- Backup retention: 30 days minimum for governance data (audit logs are a
  compliance record)

---

## Scaling

**ArkhitX governance traffic is low-volume.** Audit writes happen once per LLM
call; grounding queries happen once per LLM call. Even at high application
throughput, the governance database sees a fraction of the traffic that an
application database sees. Vertical scaling (larger RDS instance) is the
appropriate first response; horizontal read replicas if dashboard query load
grows.

**Applications scale independently.** Each application's container count,
memory, and CPU are tuned to its own workload. The governance connection adds
negligible overhead — two database writes per LLM call.

**Neo4j graph size** grows with domain data seeded per project. Knowledge
graphs are typically small (hundreds to low thousands of nodes). AuraDB's
free tier handles this comfortably for most production deployments.

---

## What Changes from the Development Setup

The development Docker Compose is correct for local work. The production
differences are:

| Concern | Development | Production |
|---|---|---|
| PostgreSQL | Docker container on localhost | Managed RDS / Azure DB |
| Neo4j | Docker container on localhost | AuraDB or dedicated VM |
| ArkhitX API | Docker container, hot reload | Immutable container image, versioned tag |
| Applications | Same Docker Compose as ArkhitX | Separate deployment target, own pipeline |
| Secrets | `.env` files | Secrets Manager / Key Vault |
| Networking | Docker bridge network | VPC Peering / VNet Peering |
| Dashboard access | `localhost:8090` | Internal load balancer + VPN |
| SDK | Local path install | Versioned private package |
| Database connections | `localhost:5432` | Private endpoint DNS |

The application code does not change. The SDK behaviour does not change. The
governance contracts (`ARKHITX_DATABASE_URL`, `ARKHITX_PROJECT_ID`) stay the
same — they point to production endpoints instead of localhost.

---

## Decision Summary

| Decision | Recommendation | Rationale |
|---|---|---|
| Applications on same server as ArkhitX? | **No** | ArkhitX is shared infrastructure; one instance governs all |
| PostgreSQL hosting | Managed cloud service | Backups, HA, failover — no operational overhead |
| Neo4j hosting | AuraDB (or dedicated VM) | AuraDB for simplicity; self-hosted for advanced plugins |
| Network connectivity | Private endpoints + VPC/VNet peering | Audit data must not cross the public internet |
| Secrets | Secrets Manager / Key Vault | Never in `.env` files or Compose definitions |
| Application deployment | Independent containers, own pipelines | Each app scales and deploys without touching ArkhitX |
| SDK distribution | Versioned private package | Pin the version; changes are explicit and controlled |
| Dashboard access | Internal network + VPN only | Governance UI is not a public-facing product |
| Database separation | Application DB separate from ArkhitX DB | RULE-005: domain data and governance data must never mix |

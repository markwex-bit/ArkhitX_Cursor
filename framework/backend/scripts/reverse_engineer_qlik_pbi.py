"""
Reverse-engineer Phase A (Architecture & Design) for the already-built
"Qlik to Power BI Migration Assessor" project.

This is a one-time demonstration script, not part of normal app startup. It:

  1. Creates (or reuses) a `Project` row representing the already-built
     solution, with `as_built_notes` populated from its real docs.
  2. Selects the "full" tier (22 documents) — creating the document rows.
  3. Drafts every document via ArchitectureDocumentAgent in retrospective
     mode, grounded strictly in `as_built_notes` (see
     app/agents/architecture_document_agent.py).
  4. Seeds 6 ADRs hand-mapped from the "Key Design Decisions" section of
     docs/PHASE-0-BUILD.md — these are already decision-quality prose in the
     source material, so they're transcribed faithfully rather than
     re-drafted by an LLM.

Run inside the arkhitx-backend container (has DATABASE_URL + the
/workspace/projects mount):

    docker-compose exec arkhitx-backend python scripts/reverse_engineer_qlik_pbi.py [--regenerate]

--regenerate re-drafts documents that already have content (normally the
script only fills in documents that are still empty, so it's safe to re-run
after an interrupted pass).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, init_db  # noqa: E402
from app.models.project import Project  # noqa: E402
from app.models.architecture_document import ArchitectureDocument  # noqa: E402
from app.models.architecture_decision import ArchitectureDecision  # noqa: E402
from app.architecture_catalog import docs_for_tier, catalog_by_key  # noqa: E402
from app.agents.architecture_document_agent import ArchitectureDocumentAgent  # noqa: E402
from app.services.audit_service import log_audit  # noqa: E402


PROJECT_NAME = "Qlik to Power BI Migration Assessor (Reverse-Engineered Phase A)"
CLIENT_NAME = "ArkhitX Portfolio — Internal Demonstration"
DESCRIPTION = (
    "Metadata-driven triage and prioritization tool for assessing which Power BI apps "
    "could replace Qlik Sense apps being sunset. Deterministic eligibility/quality "
    "gating, narrowed candidate blocking, LLM-assisted semantic matching and migration "
    "advisory, mandatory human sign-off before any migration backlog entry. This Project "
    "record reconstructs what Phase A would have produced had it existed before this "
    "solution's Phase 0 build — see as_built_notes for the source material."
)

DOCS_DIR = Path("/workspace/projects/qlik-pbi-migration/docs")
SOURCE_FILES = [
    "README.md",
    "PHASE-0-BUILD.md",
    "ARCHITECTURE.md",
    "DATA-SCHEMAS.md",
    "METADATA-CAPTURE-REFERENCE.md",
]

# Hand-mapped from docs/PHASE-0-BUILD.md, "Key Design Decisions" (1-6). Kept
# as faithful transcription rather than LLM-drafted — the source prose
# already reads as ADR content.
ADRS: list[dict] = [
    {
        "title": "Gate eligibility and quality per platform, independently, before cross-platform matching",
        "context": (
            "Power BI's own portfolio has structural noise (test/sandbox apps, personal "
            "workspaces, duplicates, orphaned datasets, stale/broken-lineage apps) unrelated "
            "to Qlik. At real-world scale (~75,000 Power BI apps), running every app through "
            "cross-platform matching — let alone an LLM call — on unfiltered inventory would "
            "be wasteful and would surface junk candidates."
        ),
        "options_considered": [
            {"option": "Run all apps through matching first, filter noise after matching",
             "chosen": False,
             "rationale": "Wastes matching/LLM cost on apps that were never viable candidates; noise pollutes match quality."},
            {"option": "Gate eligibility (Power BI) and quality (Qlik) per platform first, independently, before any cross-platform comparison",
             "chosen": True,
             "rationale": "Resolves each platform's own portfolio problems with zero involvement from the other platform."},
        ],
        "decision": (
            "Stage 0a (`services/eligibility.py`) filters the Power BI pool and Stage 0b "
            "(`services/quality.py`) scores the Qlik inventory — both deterministic, both "
            "resolved independently — before Stage 1 candidate generation ever runs."
        ),
        "consequences": (
            "Verified against sample data: 10 of 20 Power BI apps excluded before any Qlik "
            "comparison (test_or_sandbox_name: 5, stale: 4, duplicate: 3, personal_workspace: 3, "
            "broken_lineage: 2, orphaned_dataset: 1 — an app can have more than one reason). "
            "This is what keeps a real 75,000-app estate from ever reaching an LLM."
        ),
        "status": "accepted",
    },
    {
        "title": "Use data-connection-name matching as an honest proxy for lineage, not a guarantee",
        "context": (
            "Qlik's QRS API cannot expose table-level lineage at all — there is no API that "
            "returns 'this Qlik app's load script references these tables.' The only "
            "deterministic cross-platform signal available is a shared data-connection name "
            "between Qlik's `dataConnections` and Power BI's `datasourceUsages`."
        ),
        "options_considered": [
            {"option": "Pretend table-level lineage is available and infer it from other signals",
             "chosen": False,
             "rationale": "Would present an invented mapping as fact — violates the no-fabrication principle."},
            {"option": "Use data-connection-name match as an explicitly-documented best-effort proxy; degrade confidence honestly when unavailable",
             "chosen": True,
             "rationale": "Keeps the signal's limits visible instead of hidden."},
        ],
        "decision": (
            "The connection-name match is documented in `docs/DATA-SCHEMAS.md` as a "
            "best-effort proxy, not a guaranteed mapping. Where it isn't available, confidence "
            "tiering degrades to Medium/Low rather than hiding the gap."
        ),
        "consequences": (
            "Match confidence is trustworthy precisely because it's allowed to be Low — the "
            "'Customer Loyalty Analytics' sample case correctly produced no viable candidates "
            "(all Low confidence, semantic scores 5-15/100) rather than a forced weak match."
        ),
        "status": "accepted",
    },
    {
        "title": "LLM calls only happen after deterministic blocking, and only ever see structured facts",
        "context": (
            "Semantic matching and migration advisory are the two LLM-backed stages in the "
            "pipeline. Left unconstrained, an LLM could be asked to compare every Qlik app "
            "against every Power BI app, or could be given raw/unstructured dumps to reason "
            "over freely."
        ),
        "options_considered": [
            {"option": "Let the LLM compare all pairs directly from raw metadata",
             "chosen": False,
             "rationale": "Doesn't scale (400 x 75,000 pairs) and risks the LLM inventing relationships not present in the data."},
            {"option": "Deterministic blocking narrows the field first; LLM only sees structured facts it didn't invent (names, measures, sheet titles, which signals were even available)",
             "chosen": True,
             "rationale": "Bounds LLM cost and scope, and keeps every fact the LLM reasons over traceable to a real field."},
        ],
        "decision": (
            "`SemanticMatchAgent` (Stage 2) and `MigrationAdvisorAgent` (Stage 3) are only "
            "invoked on the narrowed candidate set from Stage 1's deterministic blocking, and "
            "receive structured facts including an explicit `signals_missing` field on every "
            "`MatchCandidate` — never raw dumps, never live data."
        ),
        "consequences": (
            "LLM cost stays bounded (only the top candidates per Qlik app are scored), and "
            "every semantic score / advisory rationale traces back to a specific structured "
            "input rather than an opaque interpretation of raw text."
        ),
        "status": "accepted",
    },
    {
        "title": "LLM agents degrade gracefully and honestly labeled, never silently, on failure",
        "context": (
            "`ANTHROPIC_API_KEY` may be missing, or a Claude API call may fail, in Phase 0 "
            "standalone-mode operation. The system still needs to return something usable "
            "without violating the no-mock-data/no-fallback principle."
        ),
        "options_considered": [
            {"option": "Return a generic/mocked semantic score or advisory as if the LLM produced it",
             "chosen": False,
             "rationale": "Would silently misrepresent a fallback as an AI judgment — a real governance violation."},
            {"option": "Return llm_used: false with a clearly-labeled fallback rationale that explicitly states it is not an AI judgment",
             "chosen": True,
             "rationale": "Preserves the no-fabrication principle: a fallback is never presented as if the LLM produced it."},
        ],
        "decision": (
            "Both `SemanticMatchAgent` and `MigrationAdvisorAgent` catch LLM failures and "
            "return a response with `llm_used: false` and an explicit, honestly-labeled "
            "fallback rationale, rather than a silent generic response."
        ),
        "consequences": (
            "This is scoped as a Phase-0 standalone-mode concern, not a violation of the "
            "governance 'no mock data or fallbacks' rule — the distinction is that the "
            "fallback is always visibly labeled as a fallback, never disguised as LLM output."
        ),
        "status": "accepted",
    },
    {
        "title": "No automatic sunset action anywhere in the codebase — human sign-off is mandatory",
        "context": (
            "The tool's output (migration recommendations) has real consequences if acted on "
            "incorrectly — decommissioning a Qlik app that's still needed, or migrating to a "
            "Power BI app with real functional gaps."
        ),
        "options_considered": [
            {"option": "Auto-populate the migration backlog directly from high-confidence matches",
             "chosen": False,
             "rationale": "Removes the human check on a decision with real operational consequences."},
            {"option": "Require an explicit reviewer decision (confirmed / overridden / needs_more_info) before anything reaches the backlog",
             "chosen": True,
             "rationale": "Keeps a human in the loop as the only path to action, matching the mandatory HITL principle."},
        ],
        "decision": (
            "`services/signoff.py` (SQLite via SQLAlchemy) is the only path to the migration "
            "backlog, via Stage 4's mandatory human sign-off gate. Only `confirmed` entries are "
            "exportable via Stage 5 (`/api/backlog`, `/api/backlog/export.csv`)."
        ),
        "consequences": (
            "The system produces recommendations and evidence, never decisions — the migration "
            "backlog only ever reflects entries a human explicitly confirmed."
        ),
        "status": "accepted",
    },
    {
        "title": "Keep candidate generation behind a stable, pluggable interface for future Neo4j swap-in",
        "context": (
            "At sample scale (3 Qlik apps x 20 Power BI apps), an in-memory O(n x m) comparison "
            "in `matching.generate_candidates()` is fine — and would still be fine at "
            "400 x ~2,000 after eligibility filtering. At the full estate scale "
            "(400 x 75,000), it would not be."
        ),
        "options_considered": [
            {"option": "Build the Neo4j-backed graph traversal version now, even though sample data can't prove it's better at this scale",
             "chosen": False,
             "rationale": "Would add real complexity with no way to validate the improvement against 3x20 sample data."},
            {"option": "Keep generate_candidates() as a stable-signature, swappable interface; implement the in-memory version now, defer the Neo4j graph-traversal implementation to Phase 2-3",
             "chosen": True,
             "rationale": "Ships a working Phase 0 today without foreclosing the scale-up path."},
        ],
        "decision": (
            "`matching.generate_candidates()`'s signature is designed to stay identical whether "
            "its implementation is in-memory or a Neo4j graph traversal (e.g. 'PBI datasets "
            "within 2 hops via a shared data connection') — see `ARCHITECTURE.md`, 'Phase 0 vs "
            "Future Phases' table."
        ),
        "consequences": (
            "The scale-up to a 75,000-app estate is an implementation swap behind an unchanged "
            "interface, not a rearchitecture — deferred to Phase 2-3 (Neo4j-backed grounding), "
            "consistent with ArkhitX's Phase 0-to-Phase-3 retrofit model."
        ),
        "status": "accepted",
    },
]


def build_as_built_notes() -> str:
    parts = []
    for filename in SOURCE_FILES:
        path = DOCS_DIR / filename
        if not path.exists():
            print(f"  (skip, not found: {path})")
            continue
        parts.append(f"--- {filename} ---\n\n{path.read_text(encoding='utf-8')}")
    return "\n\n".join(parts)


def get_or_create_project(db) -> Project:
    project = db.query(Project).filter(Project.name == PROJECT_NAME).first()
    if project:
        print(f"Reusing existing project {project.id}")
        return project

    print("Creating project row...")
    project = Project(
        name=PROJECT_NAME,
        client_name=CLIENT_NAME,
        description=DESCRIPTION,
        current_phase=-1,
        phase_status="in_progress",
        as_built_notes=build_as_built_notes(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    print(f"Created project {project.id}")
    return project


def ensure_full_tier(db, project: Project) -> None:
    if project.architecture_tier != "full":
        project.architecture_tier = "full"
        project.architecture_review_mode = "self"
        db.commit()

    existing_keys = {
        row.doc_key
        for row in db.query(ArchitectureDocument.doc_key)
        .filter(ArchitectureDocument.project_id == project.id)
        .all()
    }
    created = 0
    for order, entry in enumerate(docs_for_tier("full")):
        if entry["key"] in existing_keys:
            continue
        db.add(ArchitectureDocument(
            project_id=project.id,
            doc_key=entry["key"],
            title=entry["title"],
            category=entry["category"],
            tier=entry["tier"],
            sort_order=order,
            content="",
            status="not_started",
        ))
        created += 1
    db.commit()
    print(f"Full tier ensured — {created} new document rows created.")


def draft_all_documents(db, project: Project, regenerate: bool) -> None:
    catalog = catalog_by_key()
    docs = (
        db.query(ArchitectureDocument)
        .filter(ArchitectureDocument.project_id == project.id)
        .order_by(ArchitectureDocument.sort_order)
        .all()
    )
    agent = ArchitectureDocumentAgent(db)

    for doc in docs:
        if doc.content.strip() and not regenerate:
            print(f"  [skip, already drafted] {doc.title}")
            continue

        entry = catalog.get(doc.doc_key)
        if not entry:
            print(f"  [skip, no catalog entry] {doc.doc_key}")
            continue

        print(f"  [drafting] {doc.title} ...", end=" ", flush=True)
        try:
            drafted = agent.run(
                project_context={
                    "name": project.name,
                    "client_name": project.client_name,
                    "description": project.description,
                    "pain_points": project.pain_points or {},
                },
                doc_title=doc.title,
                doc_guidance=entry["guidance"],
                existing_content="",
                as_built_context=project.as_built_notes or "",
            )
        except Exception as e:
            print(f"FAILED: {e}")
            continue

        doc.content = drafted
        doc.status = "draft"
        db.commit()
        print(f"ok ({len(drafted)} chars)")

    log_audit(
        db, project_id=str(project.id), actor="script:reverse_engineer_qlik_pbi",
        action="architecture_documents_reverse_engineered",
        context={"tier": "full", "regenerate": regenerate},
    )


def seed_adrs(db, project: Project) -> None:
    existing_titles = {
        row.title
        for row in db.query(ArchitectureDecision.title)
        .filter(ArchitectureDecision.project_id == project.id)
        .all()
    }
    created = 0
    for adr in ADRS:
        if adr["title"] in existing_titles:
            print(f"  [skip, exists] {adr['title']}")
            continue
        db.add(ArchitectureDecision(
            project_id=project.id,
            title=adr["title"],
            context=adr["context"],
            options_considered=adr["options_considered"],
            decision=adr["decision"],
            consequences=adr["consequences"],
            status=adr["status"],
        ))
        created += 1
        print(f"  [created] {adr['title']}")
    db.commit()
    print(f"ADRs seeded — {created} new decision rows created.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--regenerate", action="store_true",
                         help="Re-draft documents that already have content.")
    args = parser.parse_args()

    init_db()  # ensures as_built_notes column exists even if run before app restart
    db = SessionLocal()
    try:
        print("=== Reverse-Engineering Phase A: Qlik to Power BI Migration Assessor ===\n")

        project = get_or_create_project(db)

        print("\nEnsuring full tier (22 documents)...")
        ensure_full_tier(db, project)

        print("\nDrafting documents (grounded in as_built_notes)...")
        draft_all_documents(db, project, regenerate=args.regenerate)

        print("\nSeeding ADRs from PHASE-0-BUILD.md's Key Design Decisions...")
        seed_adrs(db, project)

        print(f"\nDone. Open the ArkhitX dashboard -> Projects -> "
              f"'{project.name}' (id: {project.id}) to review.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

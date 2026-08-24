"""
Register the Payroll Reconciliation POC in ArkhitX.

This script:
  1. Registers the project in ArkhitX PostgreSQL (projects table)
  2. Seeds the POC's agent prompts into ArkhitX (agent_prompts table)
  3. Loads the ontology schema into the project record
  4. Populates Neo4j with System nodes and ontology constraints
  5. Logs all actions to audit_logs

Run from the ArkhitX_Cursor root:
    docker exec arkhitx_cursor-backend-1 python /sdk/scripts/register_payroll_project.py
"""

import json
import os
import sys
import uuid

# Add SDK to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from arkhitx.client import ArkhitXClient
from arkhitx.graph_populator import GraphPopulator


ONTOLOGY_PATH = os.path.join(
    os.path.dirname(__file__), "..", "ontologies", "payroll_reconciliation.json"
)

PROJECT_NAME = "Payroll Reconciliation"
CLIENT_NAME = "ProfitCoach"

SYSTEMS = [
    {"id": "gusto",      "name": "Gusto",               "type": "payroll",    "status": "available",    "file_hint": "Payroll Journal report (CSV)"},
    {"id": "adp",        "name": "ADP Run",              "type": "payroll",    "status": "available",    "file_hint": "Payroll Summary report (CSV)"},
    {"id": "paychex",    "name": "Paychex",              "type": "payroll",    "status": "coming_soon",  "file_hint": "Payroll Register export (CSV)"},
    {"id": "rippling",   "name": "Rippling",             "type": "payroll",    "status": "coming_soon",  "file_hint": "Payroll Summary export (CSV)"},
    {"id": "paylocity",  "name": "Paylocity",            "type": "payroll",    "status": "coming_soon",  "file_hint": "Payroll Register (CSV/Excel)"},
    {"id": "paycom",     "name": "Paycom",               "type": "payroll",    "status": "coming_soon",  "file_hint": "Payroll Detail report (CSV)"},
    {"id": "patriot",    "name": "Patriot",              "type": "payroll",    "status": "coming_soon",  "file_hint": "Payroll Summary (CSV)"},
    {"id": "onpay",      "name": "OnPay",                "type": "payroll",    "status": "coming_soon",  "file_hint": "Payroll Journal (CSV)"},
    {"id": "qbo",        "name": "QuickBooks Online",    "type": "accounting", "status": "available",    "file_hint": "Trial Balance report (CSV)",  "export_format": "csv_transaction_pro"},
    {"id": "qbd",        "name": "QuickBooks Desktop",   "type": "accounting", "status": "available",    "file_hint": "Trial Balance report (CSV)",  "export_format": "iif"},
    {"id": "xero",       "name": "Xero",                 "type": "accounting", "status": "coming_soon",  "file_hint": "Trial Balance export (CSV)",  "export_format": "csv_xero"},
    {"id": "sage",       "name": "Sage",                 "type": "accounting", "status": "coming_soon",  "file_hint": "Trial Balance export (CSV)",  "export_format": "csv_sage"},
    {"id": "freshbooks", "name": "FreshBooks",           "type": "accounting", "status": "coming_soon",  "file_hint": "Trial Balance (CSV)",         "export_format": "csv_freshbooks"},
    {"id": "wave",       "name": "Wave",                 "type": "accounting", "status": "coming_soon",  "file_hint": "Trial Balance (CSV)",         "export_format": "csv_wave"},
    {"id": "netsuite",   "name": "NetSuite",             "type": "accounting", "status": "coming_soon",  "file_hint": "Trial Balance export (CSV)",  "export_format": "csv_netsuite"},
]

AGENT_PROMPTS = [
    {
        "id": "payroll_file_parser",
        "agent_name": "File Parser Agent (Payroll Recon)",
        "description": "Parses raw CSV exports from payroll providers and QuickBooks into structured JSON.",
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 8192,
        "temperature": 0.2,
    },
    {
        "id": "payroll_mapping",
        "agent_name": "Mapping Agent (Payroll Recon)",
        "description": "Maps payroll components to QuickBooks Chart of Accounts.",
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 6000,
        "temperature": 0.2,
    },
    {
        "id": "payroll_reconciliation",
        "agent_name": "Reconciliation Agent (Payroll Recon)",
        "description": "Matches QB lump-sum entries to payroll periods and identifies variances.",
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 6000,
        "temperature": 0.2,
    },
    {
        "id": "payroll_journal_entry",
        "agent_name": "Journal Entry Agent (Payroll Recon)",
        "description": "Generates reversal and detailed breakout journal entries for each pay period.",
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 8000,
        "temperature": 0.2,
    },
]


def main():
    print("=" * 60)
    print("ArkhitX — Registering Payroll Reconciliation Project")
    print("=" * 60)

    client = ArkhitXClient()

    # Load ontology
    print("\n[1/5] Loading ontology schema...")
    with open(ONTOLOGY_PATH) as f:
        ontology = json.load(f)
    print(f"  Loaded: {len(ontology['entity_types'])} entity types, "
          f"{len(ontology['relationship_types'])} relationship types")

    # Register project in PostgreSQL
    print("\n[2/5] Registering project in ArkhitX PostgreSQL...")
    from sqlalchemy import text
    with client._engine.connect() as conn:
        existing = conn.execute(
            text("SELECT id FROM projects WHERE name = :name"),
            {"name": PROJECT_NAME},
        ).fetchone()

        if existing:
            project_id = str(existing[0])
            conn.execute(
                text("UPDATE projects SET ontology_schema = :ontology, updated_at = NOW() WHERE id = :id"),
                {"ontology": json.dumps(ontology), "id": project_id},
            )
            print(f"  Updated existing project: {project_id}")
        else:
            project_id = str(uuid.uuid4())
            conn.execute(
                text("""
                    INSERT INTO projects (id, name, client_name, description, current_phase, phase_status, ontology_schema)
                    VALUES (:id, :name, :client_name, :description, :phase, :status, :ontology)
                """),
                {
                    "id": project_id,
                    "name": PROJECT_NAME,
                    "client_name": CLIENT_NAME,
                    "description": "AI-powered payroll reconciliation tool for accounting firms. "
                                   "Compares payroll provider exports against QuickBooks journal entries, "
                                   "generates detailed breakout entries to replace lump-sum postings.",
                    "phase": 3,
                    "status": "in_progress",
                    "ontology": json.dumps(ontology),
                },
            )
            print(f"  Created project: {project_id}")

        conn.commit()
        client.project_id = project_id

    # Seed agent prompts
    print("\n[3/5] Seeding agent prompts...")
    for prompt_cfg in AGENT_PROMPTS:
        existing = client.get_prompt(prompt_cfg["id"])
        if not existing:
            client.upsert_prompt(
                agent_id=prompt_cfg["id"],
                agent_name=prompt_cfg["agent_name"],
                system_prompt=f"[Prompt loaded from POC agent class at runtime — agent_id: {prompt_cfg['id']}]",
                description=prompt_cfg["description"],
                model=prompt_cfg["model"],
                max_tokens=prompt_cfg["max_tokens"],
                temperature=prompt_cfg["temperature"],
            )
            print(f"  Seeded: {prompt_cfg['id']}")
        else:
            print(f"  Exists: {prompt_cfg['id']}")

    # Log registration
    client.log_audit(
        actor="system",
        action="project_registered",
        context={
            "project_name": PROJECT_NAME,
            "client_name": CLIENT_NAME,
            "ontology_entities": list(ontology["entity_types"].keys()),
            "ontology_relationships": list(ontology["relationship_types"].keys()),
            "agents": [p["id"] for p in AGENT_PROMPTS],
        },
    )

    # Populate Neo4j
    print("\n[4/5] Populating Neo4j knowledge graph...")
    populator = GraphPopulator(client)
    populator.ontology = ontology

    try:
        constraints = populator.create_constraints()
        print(f"  Created {len(constraints)} uniqueness constraints")

        system_count = populator.seed_systems(SYSTEMS)
        print(f"  Seeded {system_count} System nodes")

        client.log_audit(
            actor="system",
            action="graph_populated",
            context={
                "constraints_created": constraints,
                "systems_seeded": system_count,
            },
        )
    except Exception as e:
        print(f"  WARNING: Neo4j population failed: {e}")
        print("  (This is OK if Neo4j is not running — governance still works without grounding)")

    # Summary
    print("\n[5/5] Registration complete!")
    print(f"\n  Project ID:    {project_id}")
    print(f"  Project Name:  {PROJECT_NAME}")
    print(f"  Client:        {CLIENT_NAME}")
    print(f"  Phase:         3 (Wire Governance)")
    print(f"  Entity Types:  {len(ontology['entity_types'])}")
    print(f"  Relationships: {len(ontology['relationship_types'])}")
    print(f"  Agents:        {len(AGENT_PROMPTS)}")
    print(f"  Systems:       {len(SYSTEMS)}")
    print("\n  Set ARKHITX_PROJECT_ID={} in the POC's .env".format(project_id))
    print("=" * 60)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Phase 1 — Register Qlik to Power BI Migration Assessor with ArkhitX.

Run after starting infrastructure:
    cd infrastructure && docker-compose up -d
    python projects/qlik-pbi-migration/scripts/01_register_project.py
"""
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

    ontology_path = Path(__file__).parent.parent / "ontology" / "qlik-pbi-migration.json"
    if not ontology_path.exists():
        print(f"Ontology not found at {ontology_path}. Create it first.")
        sys.exit(1)

    with open(ontology_path) as f:
        ontology = json.load(f)

    project_id = client.register_project(
        name="Qlik to Power BI Migration Assessor",
        description=ontology.get("description", ""),
        ontology=ontology,
    )

    print(f"\n✅ Project registered successfully!")
    print(f"   ARKHITX_PROJECT_ID={project_id}")
    print(f"\nAdd this to your .env file and restart the project.")

if __name__ == "__main__":
    main()

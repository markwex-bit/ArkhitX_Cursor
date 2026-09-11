#!/usr/bin/env python3
"""
Phase 2 — Seed the Neo4j knowledge graph for Qlik to Power BI Migration Assessor.

Run after Phase 1 registration:
    python projects/qlik-pbi-migration/scripts/02_seed_graph.py

TODO: Replace the sample nodes below with real domain knowledge.
"""
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

    # TODO: Replace with real domain nodes for Qlik to Power BI Migration Assessor
    sample_nodes = [
        {
            "label":      "ExampleEntity",
            "properties": {"id": "example-001", "name": "Example Node", "description": "Replace with real data."}
        },
    ]

    for node in sample_nodes:
        populator.create_node(label=node["label"], properties=node["properties"])
        print(f"  Created {node['label']}: {node['properties']['id']}")

    print(f"\n✅ Seeded {len(sample_nodes)} nodes into Neo4j.")
    print("   Update this script with real domain knowledge before Phase 3.")

if __name__ == "__main__":
    main()

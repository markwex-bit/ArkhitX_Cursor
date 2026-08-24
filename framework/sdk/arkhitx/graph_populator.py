"""
Populate Neo4j with ontology schema constraints and seed data from a project.

Usage:
    from arkhitx import ArkhitXClient
    from arkhitx.graph_populator import GraphPopulator

    client = ArkhitXClient()
    populator = GraphPopulator(client)
    populator.load_ontology("path/to/ontology.json")
    populator.create_constraints()
    populator.seed_systems(systems_list)
"""

from __future__ import annotations

import json
from typing import Any

from arkhitx.client import ArkhitXClient


class GraphPopulator:
    """Populates the ArkhitX Neo4j knowledge graph from ontology and project data."""

    def __init__(self, arkhitx: ArkhitXClient):
        self.arkhitx = arkhitx
        self.ontology: dict = {}

    def load_ontology(self, path: str) -> dict:
        """Load an ontology JSON file."""
        with open(path) as f:
            self.ontology = json.load(f)
        return self.ontology

    def create_constraints(self) -> list[str]:
        """Create Neo4j uniqueness constraints for entity types that have unique properties."""
        created = []
        for entity_type, schema in self.ontology.get("entity_types", {}).items():
            for prop_name, prop_def in schema.get("properties", {}).items():
                if prop_def.get("unique"):
                    constraint_name = f"unique_{entity_type}_{prop_name}".lower()
                    cypher = (
                        f"CREATE CONSTRAINT {constraint_name} IF NOT EXISTS "
                        f"FOR (n:{entity_type}) REQUIRE n.{prop_name} IS UNIQUE"
                    )
                    self.arkhitx.write_graph(cypher)
                    created.append(constraint_name)
        return created

    def merge_node(self, label: str, id_field: str, id_value: Any, properties: dict) -> None:
        """Create or update a node in the knowledge graph."""
        props_str = ", ".join(
            f"n.{k} = ${k}" for k in properties if k != id_field
        )
        set_clause = f"SET {props_str}" if props_str else ""
        cypher = f"""
            MERGE (n:{label} {{{id_field}: ${id_field}}})
            {set_clause}
        """
        params = {id_field: id_value, **properties}
        self.arkhitx.write_graph(cypher, params)

    def merge_relationship(
        self,
        from_label: str, from_id_field: str, from_id_value: Any,
        to_label: str, to_id_field: str, to_id_value: Any,
        rel_type: str,
        properties: dict | None = None,
    ) -> None:
        """Create or update a relationship between two nodes."""
        props_str = ""
        params: dict[str, Any] = {
            "from_id": from_id_value,
            "to_id": to_id_value,
        }
        if properties:
            props_str = " {" + ", ".join(f"{k}: ${k}" for k in properties) + "}"
            params.update(properties)

        cypher = f"""
            MATCH (a:{from_label} {{{from_id_field}: $from_id}})
            MATCH (b:{to_label} {{{to_id_field}: $to_id}})
            MERGE (a)-[r:{rel_type}]->(b)
            {"SET " + ", ".join(f"r.{k} = ${k}" for k in (properties or {})) if properties else ""}
        """
        self.arkhitx.write_graph(cypher, params)

    def seed_systems(self, systems: list[dict]) -> int:
        """Seed System nodes from a list of system dicts (id, name, type, status)."""
        for system in systems:
            self.merge_node(
                "System",
                id_field="id",
                id_value=system["id"],
                properties={
                    "id": system["id"],
                    "name": system["name"],
                    "type": system["type"],
                    "status": system.get("status", "available"),
                    "file_hint": system.get("file_hint", ""),
                    "export_format": system.get("export_format", ""),
                },
            )
        return len(systems)

    def seed_account_mappings(self, client_name: str, mappings: dict) -> int:
        """Seed AccountMapping nodes and link them to a Client."""
        count = 0
        for component, mapping in mappings.items():
            mapping_id = f"{client_name}_{component}"
            self.merge_node(
                "AccountMapping",
                id_field="id",
                id_value=mapping_id,
                properties={
                    "id": mapping_id,
                    "payroll_component": component,
                    "account_number": mapping.get("account_number", ""),
                    "account_name": mapping.get("account_name", ""),
                    "side": mapping.get("side", ""),
                },
            )
            self.merge_relationship(
                "Client", "name", client_name,
                "AccountMapping", "id", mapping_id,
                "HAS_MAPPING",
            )
            count += 1
        return count

    def clear_project_data(self, project_name: str) -> None:
        """Remove all nodes and relationships for a specific project (by Client name pattern)."""
        self.arkhitx.write_graph(
            "MATCH (n) WHERE n.project = $project DETACH DELETE n",
            {"project": project_name},
        )

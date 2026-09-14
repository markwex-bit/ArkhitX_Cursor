"""
ArkhitX client — connects a solution project to ArkhitX governance infrastructure.

Provides access to:
  - PostgreSQL (audit_logs, grounding_records, agent_prompts)
  - Neo4j (knowledge graph queries)

Uses raw SQL for audit/grounding writes to avoid ORM conflicts with the
ArkhitX backend's own models.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Pure-Python cosine similarity (no numpy dependency in the SDK)."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class ArkhitXClient:
    """
    Single entry point for connecting a solution project to ArkhitX
    governance (PostgreSQL) and grounding (Neo4j).
    """

    def __init__(
        self,
        postgres_url: str | None = None,
        neo4j_uri: str | None = None,
        neo4j_user: str | None = None,
        neo4j_password: str | None = None,
        project_id: str | None = None,
    ):
        self.postgres_url = postgres_url or os.getenv(
            "ARKHITX_DATABASE_URL",
            "postgresql://user:password@localhost:5432/arkhitx",
        )
        self.neo4j_uri = neo4j_uri or os.getenv("ARKHITX_NEO4J_URI", "bolt://localhost:7687")
        self.neo4j_user = neo4j_user or os.getenv("ARKHITX_NEO4J_USER", "neo4j")
        self.neo4j_password = neo4j_password or os.getenv("ARKHITX_NEO4J_PASSWORD", "password")
        self.project_id = project_id or os.getenv("ARKHITX_PROJECT_ID")

        self._engine = create_engine(self.postgres_url, pool_pre_ping=True)
        self._neo4j_driver = None

    # ── PostgreSQL helpers (raw SQL to avoid ORM conflicts) ────────────────

    def log_audit(
        self,
        actor: str,
        action: str,
        *,
        entity_type: str | None = None,
        entity_id: str | None = None,
        context: dict | None = None,
        result: dict | None = None,
        project_id: str | None = None,
    ) -> str:
        """Write an audit log entry to ArkhitX PostgreSQL. Returns the log id."""
        log_id = str(uuid.uuid4())
        pid = project_id or self.project_id

        with self._engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO audit_logs (id, project_id, actor, action, entity_type, entity_id, context, result)
                VALUES (:id, :project_id, :actor, :action, :entity_type, :entity_id, :context, :result)
            """), {
                "id": log_id,
                "project_id": pid,
                "actor": actor,
                "action": action,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "context": json.dumps(context or {}),
                "result": json.dumps(result or {}),
            })
            conn.commit()
        return log_id

    def store_grounding(
        self,
        agent_name: str,
        grounding_score: float,
        *,
        query_path: str | None = None,
        cited_nodes: list | None = None,
        cited_edges: list | None = None,
        response_summary: str | None = None,
        project_id: str | None = None,
    ) -> str:
        """Write a grounding record. Returns the record id."""
        rec_id = str(uuid.uuid4())
        pid = project_id or self.project_id
        nodes = cited_nodes or []
        score = max(0.0, min(1.0, grounding_score))

        with self._engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO grounding_records
                    (id, project_id, agent_name, query_path, cited_nodes, cited_edges, node_count, grounding_score, response_summary)
                VALUES
                    (:id, :project_id, :agent_name, :query_path, :cited_nodes, :cited_edges, :node_count, :grounding_score, :response_summary)
            """), {
                "id": rec_id,
                "project_id": pid,
                "agent_name": agent_name,
                "query_path": query_path,
                "cited_nodes": json.dumps(nodes),
                "cited_edges": json.dumps(cited_edges or []),
                "node_count": len(nodes),
                "grounding_score": score,
                "response_summary": response_summary,
            })
            conn.commit()
        return rec_id

    def get_prompt(self, agent_id: str) -> dict | None:
        """Load an agent prompt config from ArkhitX. Returns None if not found."""
        with self._engine.connect() as conn:
            row = conn.execute(
                text("SELECT system_prompt, model, max_tokens, temperature FROM agent_prompts WHERE id = :id"),
                {"id": agent_id},
            ).fetchone()

        if not row:
            return None
        return {
            "system_prompt": row[0],
            "model": row[1],
            "max_tokens": row[2],
            "temperature": row[3],
        }

    def upsert_prompt(
        self,
        agent_id: str,
        agent_name: str,
        system_prompt: str,
        *,
        description: str | None = None,
        model: str = "claude-sonnet-4-5-20250929",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ) -> None:
        """Create or update an agent prompt in ArkhitX."""
        with self._engine.connect() as conn:
            existing = conn.execute(
                text("SELECT id FROM agent_prompts WHERE id = :id"),
                {"id": agent_id},
            ).fetchone()

            if existing:
                conn.execute(text("""
                    UPDATE agent_prompts
                    SET agent_name = :agent_name, system_prompt = :system_prompt,
                        description = :description, model = :model,
                        max_tokens = :max_tokens, temperature = :temperature,
                        updated_at = NOW()
                    WHERE id = :id
                """), {
                    "id": agent_id,
                    "agent_name": agent_name,
                    "system_prompt": system_prompt,
                    "description": description,
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                })
            else:
                conn.execute(text("""
                    INSERT INTO agent_prompts (id, agent_name, description, system_prompt, model, max_tokens, temperature)
                    VALUES (:id, :agent_name, :description, :system_prompt, :model, :max_tokens, :temperature)
                """), {
                    "id": agent_id,
                    "agent_name": agent_name,
                    "description": description,
                    "system_prompt": system_prompt,
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                })
            conn.commit()

    # ── Neo4j helpers ───────────────────────────────────────────────────────

    def _get_neo4j_driver(self):
        if not self._neo4j_driver:
            from neo4j import GraphDatabase
            self._neo4j_driver = GraphDatabase.driver(
                self.neo4j_uri,
                auth=(self.neo4j_user, self.neo4j_password),
            )
        return self._neo4j_driver

    def query_graph(self, cypher: str, params: dict | None = None) -> list[dict]:
        """Run a read query against the ArkhitX Neo4j knowledge graph."""
        driver = self._get_neo4j_driver()
        with driver.session() as session:
            result = session.run(cypher, params or {})
            return [record.data() for record in result]

    def write_graph(self, cypher: str, params: dict | None = None) -> list[dict]:
        """Run a write query against the ArkhitX Neo4j knowledge graph."""
        driver = self._get_neo4j_driver()
        with driver.session() as session:
            result = session.run(cypher, params or {})
            return [record.data() for record in result]

    def get_grounding_context(
        self,
        entity_type: str | None = None,
        filters: dict | None = None,
        depth: int = 1,
        *,
        retrieval_strategy: str = "graph",
        vector_index: str | None = None,
        query_embedding: list[float] | None = None,
        top_k: int = 5,
    ) -> dict:
        """
        Retrieve grounding context from the knowledge graph.

        Dispatches on `retrieval_strategy` (see GovernedBaseAgent._grounding_query
        for the full decision guide):
          - "graph"      relationship traversal (existing default behavior)
          - "structured" exact-match fetch, no relationship traversal
          - "vector"     Neo4j native vector index similarity search
          - "hybrid"     graph traversal, reranked by embedding similarity

        Always returns nodes, edges, query path, and node count.
        """
        if retrieval_strategy == "vector":
            return self._vector_grounding(vector_index, query_embedding, top_k)
        if retrieval_strategy == "hybrid":
            return self._hybrid_grounding(
                entity_type, filters, depth, query_embedding, top_k
            )
        if retrieval_strategy == "structured":
            return self._graph_grounding(entity_type, filters, depth=0)
        return self._graph_grounding(entity_type, filters, depth)

    def _graph_grounding(
        self, entity_type: str, filters: dict | None, depth: int
    ) -> dict:
        """Strategy: 'graph' (traversal) and 'structured' (depth=0, exact match)."""
        where_clauses = []
        params: dict[str, Any] = {}
        if filters:
            for i, (key, value) in enumerate(filters.items()):
                param_name = f"p{i}"
                where_clauses.append(f"e.{key} = ${param_name}")
                params[param_name] = value

        where_str = " AND ".join(where_clauses)
        where_line = f"WHERE {where_str}" if where_str else ""
        traversal = "OPTIONAL MATCH (e)-[r]-(related)" if depth > 0 else ""
        related_return = (
            "type(r) AS rel_type, labels(related) AS related_labels, properties(related) AS related_props"
            if depth > 0
            else "NULL AS rel_type, NULL AS related_labels, NULL AS related_props"
        )

        cypher = f"""
            MATCH (e:{entity_type}) {where_line}
            {traversal}
            RETURN
                labels(e) AS entity_labels,
                properties(e) AS entity_props,
                {related_return}
        """

        raw_results = self.query_graph(cypher, params)

        nodes = []
        seen_ids = set()
        for record in raw_results:
            props = record.get("entity_props", {})
            node_id = props.get("id") or props.get("name")
            if node_id and node_id not in seen_ids:
                seen_ids.add(node_id)
                nodes.append(props)
            related = record.get("related_props") or {}
            r_id = related.get("id") or related.get("name")
            if r_id and r_id not in seen_ids:
                seen_ids.add(r_id)
                nodes.append(related)

        return {
            "nodes": nodes,
            "query_path": cypher.strip(),
            "node_count": len(nodes),
            "raw_results": raw_results,
        }

    def _vector_grounding(
        self,
        vector_index: str | None,
        query_embedding: list[float] | None,
        top_k: int,
    ) -> dict:
        """
        Strategy: 'vector'. Requires a Neo4j native vector index already
        created on the target node label/property (see
        framework/docs/02-POPULATE-GRAPH-ADVANCED.md) and a precomputed query
        embedding — the SDK does not generate embeddings itself, since the
        embedding model choice is a project-level decision.
        """
        if not vector_index or not query_embedding:
            raise ValueError(
                "retrieval_strategy='vector' requires both 'vector_index' and "
                "'query_embedding' in the grounding spec."
            )

        cypher = """
            CALL db.index.vector.queryNodes($index_name, $top_k, $embedding)
            YIELD node, score
            RETURN properties(node) AS entity_props, score
        """
        params = {
            "index_name": vector_index,
            "top_k": top_k,
            "embedding": query_embedding,
        }
        raw_results = self.query_graph(cypher, params)

        nodes = []
        for record in raw_results:
            props = dict(record.get("entity_props") or {})
            props["_similarity"] = record.get("score")
            nodes.append(props)

        return {
            "nodes": nodes,
            "query_path": cypher.strip(),
            "node_count": len(nodes),
            "raw_results": raw_results,
        }

    def _hybrid_grounding(
        self,
        entity_type: str,
        filters: dict | None,
        depth: int,
        query_embedding: list[float] | None,
        top_k: int,
    ) -> dict:
        """
        Strategy: 'hybrid'. Runs graph traversal to get structurally relevant
        candidates, then reranks by cosine similarity against each node's
        `embedding` property (if present) and keeps the top_k. Falls back to
        unranked graph results if no query_embedding is supplied or no
        candidate nodes carry an `embedding` property.
        """
        graph_result = self._graph_grounding(entity_type, filters, depth)
        if not query_embedding:
            return graph_result

        scored = []
        unscored = []
        for node in graph_result["nodes"]:
            embedding = node.get("embedding")
            if embedding:
                node = dict(node)
                node["_similarity"] = _cosine_similarity(query_embedding, embedding)
                scored.append(node)
            else:
                unscored.append(node)

        scored.sort(key=lambda n: n["_similarity"], reverse=True)
        ranked_nodes = scored[:top_k] + unscored[: max(0, top_k - len(scored))]

        return {
            "nodes": ranked_nodes,
            "query_path": graph_result["query_path"] + "\n-- reranked by embedding cosine similarity",
            "node_count": len(ranked_nodes),
            "raw_results": graph_result["raw_results"],
        }

    # ── Cleanup ─────────────────────────────────────────────────────────────

    def close(self):
        """Close all connections."""
        self._engine.dispose()
        if self._neo4j_driver:
            self._neo4j_driver.close()

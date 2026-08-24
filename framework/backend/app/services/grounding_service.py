from app.graph import graph_service
from app.models.grounding_record import GroundingRecord


async def retrieve_graph_context(project_id: str, query: str, params: dict = None) -> dict:
    merged_params = {"project_id": project_id}
    if params:
        merged_params.update(params)

    results = await graph_service.execute(query, merged_params)

    nodes = []
    edges = []
    for record in results:
        for key, value in record.items():
            if isinstance(value, dict):
                if "id" in value:
                    nodes.append(value)

    return {
        "nodes": nodes,
        "edges": edges,
        "query_path": query,
        "node_count": len(nodes),
        "raw_results": results,
    }


def get_grounding_records(db, project_id: str = None, agent_name: str = None,
                          limit: int = 100) -> list[GroundingRecord]:
    query = db.query(GroundingRecord)
    if project_id:
        query = query.filter(GroundingRecord.project_id == project_id)
    if agent_name:
        query = query.filter(GroundingRecord.agent_name == agent_name)
    return query.order_by(GroundingRecord.created_at.desc()).limit(limit).all()


def get_grounding_summary(db, project_id: str) -> dict:
    records = db.query(GroundingRecord).filter(
        GroundingRecord.project_id == project_id
    ).all()

    if not records:
        return {"total_calls": 0, "avg_score": 0, "agents": {}}

    by_agent = {}
    for r in records:
        if r.agent_name not in by_agent:
            by_agent[r.agent_name] = {"calls": 0, "total_score": 0}
        by_agent[r.agent_name]["calls"] += 1
        by_agent[r.agent_name]["total_score"] += (r.grounding_score or 0)

    for agent_data in by_agent.values():
        agent_data["avg_score"] = agent_data["total_score"] / max(agent_data["calls"], 1)
        del agent_data["total_score"]

    scores = [r.grounding_score for r in records if r.grounding_score is not None]
    return {
        "total_calls": len(records),
        "avg_score": sum(scores) / max(len(scores), 1),
        "agents": by_agent,
    }

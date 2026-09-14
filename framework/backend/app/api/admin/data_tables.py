"""Scoped governance database browser — whitelist only."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from app.database import get_db, engine

router = APIRouter(prefix="/admin/data", tags=["admin", "data-tables"])

GOVERNANCE_TABLES: dict[str, dict] = {
    "projects": {"editable": True, "scope": "id", "group": "PROJECT"},
    "agent_prompts": {"editable": True, "scope": None, "group": "GOVERNANCE"},
    "architecture_documents": {"editable": True, "scope": "project_id", "group": "PROJECT"},
    "architecture_decisions": {"editable": True, "scope": "project_id", "group": "PROJECT"},
    "audit_logs": {"editable": False, "scope": "project_id", "group": "GOVERNANCE"},
    "grounding_records": {"editable": False, "scope": "project_id", "group": "GOVERNANCE"},
    "gate_decisions": {"editable": False, "scope": "project_id", "group": "GOVERNANCE"},
    "llm_usage_logs": {"editable": False, "scope": "project_id", "group": "GOVERNANCE"},
    "pipeline_events": {"editable": False, "scope": "project_id", "group": "GOVERNANCE"},
    "clients": {"editable": True, "scope": None, "group": "SYSTEM"},
}


def _assert_table(name: str) -> dict:
    if name not in GOVERNANCE_TABLES:
        raise HTTPException(400, f"Table '{name}' is not exposed in governance data console")
    return GOVERNANCE_TABLES[name]


@router.get("/tables")
def list_tables(db: Session = Depends(get_db)):
    result = []
    for table_name, meta in sorted(GOVERNANCE_TABLES.items()):
        try:
            count = db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar() or 0
        except Exception:
            count = -1
        result.append({
            "table_name": table_name,
            "row_count": count,
            "editable": meta["editable"],
            "group": meta["group"],
        })
    return result


@router.get("/tables/{table_name}/rows")
def get_rows(
    table_name: str,
    project_id: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    meta = _assert_table(table_name)
    scope_col = meta.get("scope")
    where = ""
    params: dict = {"limit": limit, "offset": offset}
    if project_id and scope_col:
        where = f' WHERE "{scope_col}" = :project_id'
        params["project_id"] = project_id
    count_sql = f'SELECT COUNT(*) FROM "{table_name}"{where}'
    total = db.execute(text(count_sql), params).scalar() or 0
    rows_sql = f'SELECT * FROM "{table_name}"{where} ORDER BY 1 DESC LIMIT :limit OFFSET :offset'
    rows = db.execute(text(rows_sql), params).mappings().all()
    return {
        "table_name": table_name,
        "editable": meta["editable"],
        "total_count": total,
        "rows": [dict(r) for r in rows],
    }


class RowUpdate(BaseModel):
    data: dict


class RowCreate(BaseModel):
    data: dict


@router.post("/tables/{table_name}/rows")
def create_row(table_name: str, body: RowCreate, db: Session = Depends(get_db)):
    meta = _assert_table(table_name)
    if not meta["editable"]:
        raise HTTPException(403, "This table is read-only")

    inspector = inspect(engine)
    columns = [c["name"] for c in inspector.get_columns(table_name)]
    data = {k: v for k, v in body.data.items() if k in columns}
    if not data:
        raise HTTPException(400, "No valid columns provided")

    cols = ", ".join(f'"{k}"' for k in data.keys())
    vals = ", ".join(f":{k}" for k in data.keys())
    db.execute(text(f'INSERT INTO "{table_name}" ({cols}) VALUES ({vals})'), data)
    db.commit()
    return {"status": "created", "data": data}


@router.put("/tables/{table_name}/rows/{row_id}")
def update_row(table_name: str, row_id: str, body: RowUpdate, db: Session = Depends(get_db)):
    meta = _assert_table(table_name)
    if not meta["editable"]:
        raise HTTPException(403, "This table is read-only")
    if table_name == "audit_logs":
        raise HTTPException(403, "Audit logs are immutable")

    inspector = inspect(engine)
    pk_cols = inspector.get_pk_constraint(table_name).get("constrained_columns") or ["id"]
    pk = pk_cols[0]

    sets = ", ".join(f'"{k}" = :{k}' for k in body.data.keys())
    if not sets:
        raise HTTPException(400, "No fields to update")
    params = {**body.data, "row_id": row_id}
    db.execute(text(f'UPDATE "{table_name}" SET {sets} WHERE "{pk}" = :row_id'), params)
    db.commit()
    return {"status": "updated", "id": row_id}

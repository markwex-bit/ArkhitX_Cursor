from app.models.audit_log import AuditLog


def log_audit(db, project_id: str = None, actor: str = "system", action: str = "",
              entity_type: str = None, entity_id: str = None,
              context: dict = None, result: dict = None) -> AuditLog:
    entry = AuditLog(
        project_id=project_id,
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        context=context or {},
        result=result or {},
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_audit_logs(db, project_id: str = None, action: str = None,
                   limit: int = 100, offset: int = 0) -> list[AuditLog]:
    query = db.query(AuditLog)
    if project_id:
        query = query.filter(AuditLog.project_id == project_id)
    if action:
        query = query.filter(AuditLog.action.ilike(f"%{action}%"))
    return query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

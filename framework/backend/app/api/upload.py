import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.audit_service import log_audit

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/data/uploads")


@router.post("/")
async def upload_file(
    project_id: str = Form(...),
    purpose: str = Form("general"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")

    content = await file.read()
    with open(saved_path, "wb") as f:
        f.write(content)

    log_audit(db, project_id=project_id, actor="consultant",
              action=f"file_uploaded:{purpose}",
              entity_type="file", entity_id=file_id,
              context={
                  "filename": file.filename,
                  "size": len(content),
                  "purpose": purpose,
                  "saved_path": saved_path,
              })

    return {
        "file_id": file_id,
        "filename": file.filename,
        "size": len(content),
        "purpose": purpose,
        "path": saved_path,
    }

"""Data intake summary for the UI — where data comes from and how to load it."""
from __future__ import annotations

from app.config import get_settings
from app.models.catalog import IntakeSummary
from app.services import ingestion
from app.services.ingestion import SAMPLES_DIR

LOAD_STEPS_SAMPLE = [
    "Export Qlik + Power BI metadata per docs/DATA-REQUEST-CHECKLIST.md (send unfiltered).",
    "Place JSON at samples/qlik/qlik_apps_export.json and samples/powerbi/powerbi_scan_result.json.",
    "Set DATA_SOURCE=sample in projects/qlik-pbi-migration/.env (project root, not backend/.env).",
    "Restart: docker-compose up -d from the project folder.",
    "Open the Intake tab — confirm counts and metadata coverage % before qualification.",
]

LOAD_STEPS_LIVE = [
    "Configure Qlik + Power BI credentials in .env — see docs/LIVE-EXTRACTION-SETUP.md.",
    "Set DATA_SOURCE=live in projects/qlik-pbi-migration/.env.",
    "Restart containers; pipeline extracts on load.",
    "Open the Intake tab — confirm counts and metadata coverage % before qualification.",
]


def get_intake_summary() -> IntakeSummary:
    settings = get_settings()
    qlik_apps = ingestion.load_qlik_apps()
    pbi_apps = ingestion.load_pbi_apps()

    if settings.data_source == "live":
        qlik_source = "Live Qlik Sense APIs (QRS + optional Engine)"
        pbi_source = "Live Power BI Admin Scanner API"
        steps = LOAD_STEPS_LIVE
    else:
        qlik_path = SAMPLES_DIR / "qlik" / "qlik_apps_export.json"
        pbi_path = SAMPLES_DIR / "powerbi" / "powerbi_scan_result.json"
        qlik_source = str(qlik_path)
        pbi_source = str(pbi_path)
        steps = LOAD_STEPS_SAMPLE

    return IntakeSummary(
        data_source=settings.data_source,
        qlik_count=len(qlik_apps),
        pbi_count=len(pbi_apps),
        qlik_source_label=qlik_source,
        pbi_source_label=pbi_source,
        load_steps=steps,
        workflow_doc="docs/USER-WORKFLOW.md",
    )

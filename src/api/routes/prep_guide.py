"""
Prep guide routes (Issue 25 addition).

GET /prep-guide/{application_id} returns the full PrepGuide row for an
application, with the JSON-string columns (interview_rounds, topics to
prepare, resources, mock questions, company intel) parsed back into
objects, plus company_name/role_title context from the joined Job row.

A 404 with a clear message is returned when no guide exists yet — that's
an expected case (guide generation runs asynchronously after an
application), not a server error.
"""

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from src.config.database import get_db
from src.models.application import Application
from src.models.job import Job
from src.models.prep_guide import PrepGuide

router = APIRouter(
    prefix="/prep-guide",
    tags=["prep-guide"],
)


def _parse_json(raw: Optional[str]) -> Any:
    """Parse a PrepGuide JSON-string column; None/empty/corrupt → None.

    The guide fields are stored as JSON *strings* (single-column JSONB
    wasn't used), so the API must parse them before returning. A corrupt
    or missing value degrades to None rather than crashing the route.
    """
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


class PrepGuideResponse(BaseModel):
    id: int
    application_id: int
    company_name: str
    role_title: str
    interview_rounds: Optional[Dict[str, Any]] = None
    topics_to_prepare: Optional[Dict[str, List[str]]] = None
    resources: Optional[Dict[str, List[Dict[str, str]]]] = None
    mock_questions: Optional[List[Dict[str, str]]] = None
    company_intel: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None


@router.get("/{application_id}", response_model=PrepGuideResponse)
def get_prep_guide(application_id: int, db: Session = Depends(get_db)):
    """Return the full prep guide for an application.

    Raises:
        HTTPException 404: if no PrepGuide row exists for this
            application_id (guide not generated yet).
    """
    row = (
        db.query(PrepGuide, Application, Job)
        .join(Application, PrepGuide.application_id == Application.id)
        .join(Job, Application.job_id == Job.id)
        .filter(PrepGuide.application_id == application_id)
        .first()
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Prep guide not ready yet for this application.",
        )

    guide, application, job = row

    # Prefer the Job row for display context; fall back to the guide's own
    # stored copies (company_intel_agent may create rows with role_title="").
    company = job.company_name if job and job.company_name else guide.company_name
    role = job.role_title if job and job.role_title else guide.role_title

    return PrepGuideResponse(
        id=guide.id,
        application_id=guide.application_id,
        company_name=company or "",
        role_title=role or "",
        interview_rounds=_parse_json(guide.interview_rounds),
        topics_to_prepare=_parse_json(guide.topics_to_prepare),
        resources=_parse_json(guide.resources),
        mock_questions=_parse_json(guide.mock_questions),
        company_intel=_parse_json(guide.company_intel),
        created_at=guide.created_at,
    )

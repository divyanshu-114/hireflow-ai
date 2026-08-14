import re
from pathlib import Path
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from src.config.database import get_db
from src.models.application import Application
from src.models.job import Job

router = APIRouter(
    prefix="/applications",
    tags=["applications"],
)


class ApplicationResponse(BaseModel):
    id: int
    user_id: int
    job_id: int
    company_name: str
    role_title: str
    status: str
    resume_path: Optional[str] = None
    failure_reason: Optional[str] = None
    manual_application_url: Optional[str] = None
    applied_at: Optional[datetime] = None

    class Config:
        from_attributes = True


@router.get("/{user_id}", response_model=List[ApplicationResponse])
def get_user_applications(
    user_id: int,
    status: Optional[str] = Query(
        None, description="Filter by status (e.g., applied, needs_action, failed)"
    ),
    skip: int = Query(0, ge=0, description="Pagination skip"),
    limit: int = Query(50, ge=1, le=100, description="Pagination limit"),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Application, Job)
        .join(Job, Application.job_id == Job.id)
        .filter(Application.user_id == user_id)
    )

    if status:
        query = query.filter(Application.status == status)

    query = query.order_by(Application.created_at.desc())

    # Pagination
    results = query.offset(skip).limit(limit).all()

    response = []
    for app, job in results:
        app_dict = {
            "id": app.id,
            "user_id": app.user_id,
            "job_id": app.job_id,
            "company_name": job.company_name,
            "role_title": job.role_title,
            "status": app.status,
            "resume_path": app.resume_path,
            "failure_reason": app.failure_reason,
            "applied_at": app.applied_at,
        }

        # Include manual application URL for needs_action
        if app.status == "needs_action":
            app_dict["manual_application_url"] = job.application_url

        response.append(ApplicationResponse(**app_dict))

    return response


# ---------------------------------------------------------------------- #
# GET /applications/{user_id}/{job_id}/resume  —  serve the generated PDF
# ---------------------------------------------------------------------- #
# Issue 13 stores resumes at data/resumes/{user_id}/{job_id}_resume_v{N}.pdf
# and records the path on Application.resume_path, but nothing served them
# over HTTP. This route is what makes the frontend's ResumePreview work.
#
# Every failure mode (no row, no path, file deleted/moved) returns a clean
# 404 rather than a 500.
# ---------------------------------------------------------------------- #


def _sanitize_resume_filename(
    company_name: str, role_title: str, version: Optional[int] = None
) -> str:
    """Build a filesystem/header-safe filename for the resume PDF.

    Content-Disposition filenames must be single-line ASCII — replace any
    character outside ``[A-Za-z0-9._-]`` with an underscore and collapse
    runs, falling back to ``resume.pdf`` if nothing usable remains.

    When a resume_version is available the filename follows the library
    convention ``{Company}_{Role}_v{N}.pdf`` (Issue 25 acceptance
    criteria); otherwise it degrades to ``{Company}_{Role}_resume.pdf``.
    """
    company = (company_name or "").strip()
    role = (role_title or "").strip()
    if not company and not role:
        return "resume.pdf"

    raw = f"{company or 'company'}_{role or 'role'}"
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", raw)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_.-")
    if not cleaned:
        return "resume.pdf"

    suffix = f"_v{int(version)}" if version else "_resume"
    return f"{cleaned}{suffix}.pdf"


@router.get("/{user_id}/{job_id}/resume")
def get_application_resume(
    user_id: int,
    job_id: int,
    db: Session = Depends(get_db),
):
    """Serve the generated PDF resume for a user's application.

    Returns the PDF inline so the frontend can embed it in an iframe.

    Raises:
        HTTPException 404: If no application row exists, no resume has
            been generated yet (resume_path is null/empty), or the file
            no longer exists on disk.
    """
    row = (
        db.query(Application, Job)
        .join(Job, Application.job_id == Job.id)
        .filter(
            Application.user_id == user_id,
            Application.job_id == job_id,
        )
        .first()
    )

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Application not found for this user and job.",
        )

    app, job = row

    if not app.resume_path:
        raise HTTPException(
            status_code=404,
            detail="Resume not yet generated for this application.",
        )

    # Issue 13 stores resume_path relative to the project root (e.g.
    # "data/resumes/1/5_resume_v1.pdf"). Anchor it to the project root
    # (src/api/routes/..x4) rather than the process CWD so the route works
    # no matter where uvicorn is launched from.
    candidate = Path(app.resume_path)
    if not candidate.is_absolute():
        candidate = Path(__file__).resolve().parents[3] / candidate
    pdf_path = candidate.resolve()

    if not pdf_path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "Resume file not found on disk. It may have been moved " "or deleted."
            ),
        )

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=_sanitize_resume_filename(
            job.company_name, job.role_title, app.resume_version
        ),
        content_disposition_type="inline",
    )


# ---------------------------------------------------------------------- #
# GET /applications/{user_id}/resumes  —  list a user's resume library
# ---------------------------------------------------------------------- #
# Issue 25: the resume library needs a LIST of every generated resume for
# a user (company, role, version, date) so the frontend can render a
# library page. The server-side resume_path is deliberately NOT returned —
# the frontend builds download links from the public single-file route
# above instead, so file paths never leak to the browser.
# ---------------------------------------------------------------------- #


@router.get("/{user_id}/resumes")
def get_user_resumes(user_id: int, db: Session = Depends(get_db)):
    """List every generated resume for a user (resume library).

    Returns one entry per Application row that has a resume_path, joined
    with the Job for display context. Rows without a generated resume are
    excluded entirely.

    Raises:
        HTTPException 404: if the user has no application rows at all.
    """
    rows = (
        db.query(Application, Job)
        .join(Job, Application.job_id == Job.id)
        .filter(
            Application.user_id == user_id,
            Application.resume_path.isnot(None),
            Application.resume_path != "",
        )
        .order_by(Application.created_at.desc())
        .all()
    )

    if not rows:
        # Check the user actually exists so a typo'd id gets a 404 rather
        # than a confusing empty list.
        from src.models.user import User

        user_exists = db.query(User).filter(User.id == user_id).first()
        if user_exists is None:
            raise HTTPException(
                status_code=404,
                detail="User not found.",
            )

    return [
        {
            "job_id": app.job_id,
            "company_name": job.company_name,
            "role_title": job.role_title,
            "resume_version": app.resume_version,
            "created_at": app.created_at,
        }
        for app, job in rows
    ]

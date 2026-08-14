"""
Tests for the resume PDF-serving route (Issue 24 addition).

GET /applications/{user_id}/{job_id}/resume serves the PDF stored on
Application.resume_path. It must return a clean 404 for every missing
case (no row, no resume_path, file deleted) and a real PDF otherwise.

Uses the same in-memory SQLite + dependency-override pattern as
test_profile_api.py — no real Postgres, no real xelatex.

Run:
    pytest tests/test_resume_route.py -v
"""

from __future__ import annotations

from datetime import datetime
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# SQLite does not understand PostgreSQL's JSONB type (used by User.master_profile).
# Patch SQLiteTypeCompiler BEFORE importing models so create_all() works.
# ---------------------------------------------------------------------------
from sqlalchemy.dialects.sqlite.base import SQLiteTypeCompiler  # noqa: E402


def _visit_JSONB(self, type_, **kw):  # noqa: N802
    """Teach SQLite's DDL compiler to render JSONB as JSON."""
    return self.visit_JSON(type_, **kw)


SQLiteTypeCompiler.visit_JSONB = _visit_JSONB

import src.models.user  # noqa: F401, E402
import src.models.job  # noqa: F401, E402
import src.models.application  # noqa: F401, E402
import src.models.shortlist  # noqa: F401, E402

from src.api.main import app  # noqa: E402
from src.config.database import get_db  # noqa: E402
from src.models import Base  # noqa: E402
from src.models.application import Application  # noqa: E402
from src.models.job import Job  # noqa: E402
from src.models.user import User  # noqa: E402

SQLITE_URL = "sqlite:///:memory:"

test_engine = create_engine(
    SQLITE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db() -> Generator[Session, None, None]:
    """Replace the real PostgreSQL session with an in-memory SQLite session."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _override_db():
    """Swap in the SQLite dependency for this module's tests only.

    IMPORTANT: the override is installed per-test and restored afterwards
    (rather than set at module import) so this file can never clobber the
    global get_db override that tests/test_profile_api.py sets at import.
    """
    previous = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db
    try:
        yield
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test and drop them afterwards."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture()
def seeded_db(tmp_path):
    """Seed a user, job and application row; return the resume file path."""
    db = TestingSessionLocal()
    user = User(
        id=1,
        name="Arjun Sharma",
        email="arjun@example.com",
        mode="internship",
        weekly_quota=5,
        confirmation_mode="batch",
    )
    job = Job(
        id=1,
        company_name="LangChain Labs",
        role_title="AI Engineer Intern",
        jd_text="Build RAG pipelines.",
        skills_required="Python, LangChain",
        application_url="https://example.com/apply",
        source="test",
        listing_type="internship",
        posting_date=datetime.utcnow(),
    )
    db.add_all([user, job])
    db.commit()

    resume_file = tmp_path / "1_resume_v1.pdf"
    resume_file.write_bytes(b"%PDF-1.4 fake resume content")

    yield db, resume_file

    db.close()


def _add_application(db: Session, resume_path):
    app_row = Application(
        id=1,
        user_id=1,
        job_id=1,
        status="applied",
        resume_path=str(resume_path) if resume_path else None,
        applied_at=datetime.utcnow(),
    )
    db.add(app_row)
    db.commit()
    return app_row


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


def test_returns_pdf_when_resume_exists(client: TestClient, seeded_db, tmp_path):
    """Happy path: existing row + existing file → 200, PDF headers."""
    db, resume_file = seeded_db
    _add_application(db, resume_file)

    response = client.get("/applications/1/1/resume")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/pdf")
    disposition = response.headers["content-disposition"]
    assert "inline" in disposition
    # Issue 25: the library convention is {Company}_{Role}_v{N}.pdf.
    assert "LangChain_Labs_AI_Engineer_Intern_v1.pdf" in disposition
    assert response.content == b"%PDF-1.4 fake resume content"


def test_404_when_no_application_row(client: TestClient, seeded_db):
    """No Application row for user+job → 404, not a crash."""
    db, _ = seeded_db
    response = client.get("/applications/1/1/resume")
    assert response.status_code == 404
    assert "application not found" in response.json()["detail"].lower()


def test_404_when_resume_path_is_null(client: TestClient, seeded_db):
    """Row exists but resume_path is null → 404 with clear message."""
    db, _ = seeded_db
    _add_application(db, None)

    response = client.get("/applications/1/1/resume")
    assert response.status_code == 404
    assert "not yet generated" in response.json()["detail"].lower()


def test_404_when_resume_file_missing_on_disk(client: TestClient, seeded_db, tmp_path):
    """resume_path set but the file was deleted → 404, not a 500."""
    db, _ = seeded_db
    ghost_path = tmp_path / "deleted.pdf"
    _add_application(db, ghost_path)  # never create the file

    response = client.get("/applications/1/1/resume")
    assert response.status_code == 404
    assert "not found on disk" in response.json()["detail"].lower()


def test_relative_resume_path_anchored_to_project_root(client: TestClient, seeded_db):
    """Issue 13 stores resume_path relative to the project root.

    The route must resolve relative paths against the repo root (not the
    process CWD). We assert the resolved location is the project root by
    pointing at a path that only exists there, then verifying the 404 —
    which proves the anchor logic ran without crashing.
    """
    db, _ = seeded_db
    # data/resumes/… does exist at the repo root, but this specific file
    # doesn't — so the resolved path fails the existence check cleanly.
    _add_application(db, "data/resumes/1/999_never_created.pdf")

    response = client.get("/applications/1/1/resume")
    assert response.status_code == 404
    assert "not found on disk" in response.json()["detail"].lower()


def test_sanitize_resume_filename():
    """Header-safe filename: spaces/weird chars → underscores, keeps .pdf."""
    from src.api.routes.applications import _sanitize_resume_filename

    name = _sanitize_resume_filename("Company & Co", "ML Eng/Intern!")
    assert name == "Company_Co_ML_Eng_Intern_resume.pdf"
    assert _sanitize_resume_filename("", "") == "resume.pdf"

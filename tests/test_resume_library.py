"""
Tests for the resume-library list endpoint (Issue 25 addition).

GET /applications/{user_id}/resumes returns one entry per Application row
with a generated resume (company, role, version, date) — deliberately NOT
the server-side resume_path. Follows the test_resume_route.py pattern:
in-memory SQLite + per-test dependency override.
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
import src.models.prep_guide  # noqa: F401, E402
import src.models.shortlist  # noqa: F401, E402
import src.models.report  # noqa: F401, E402

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
    """Swap in the SQLite dependency for this module's tests only."""
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


def _seed(db: Session) -> None:
    """Seed a user, two jobs, and two applications (one with a resume)."""
    user = User(
        id=1,
        name="Arjun Sharma",
        email="arjun@example.com",
        mode="internship",
        weekly_quota=5,
        confirmation_mode="batch",
    )
    job_a = Job(
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
    job_b = Job(
        id=2,
        company_name="VectorDB Co",
        role_title="RAG Engineer",
        jd_text="Build vector databases.",
        skills_required="Python, FAISS",
        application_url="https://example.com/apply-b",
        source="test",
        listing_type="job",
        posting_date=datetime.utcnow(),
    )
    db.add_all([user, job_a, job_b])
    db.commit()

    db.add_all(
        [
            Application(
                id=1,
                user_id=1,
                job_id=1,
                status="applied",
                resume_path="data/resumes/1/1_resume_v2.pdf",
                resume_version=2,
                applied_at=datetime.utcnow(),
            ),
            # No resume generated yet — must be excluded from the library.
            Application(
                id=2,
                user_id=1,
                job_id=2,
                status="resume_pending",
                resume_path=None,
                applied_at=datetime.utcnow(),
            ),
        ]
    )
    db.commit()


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


def test_lists_only_resumes_with_no_path_leak(client: TestClient):
    """Rows with a resume appear; rows without are excluded; no resume_path."""
    db = TestingSessionLocal()
    _seed(db)
    db.close()

    response = client.get("/applications/1/resumes")

    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data) == 1
    entry = data[0]
    assert entry["job_id"] == 1
    assert entry["company_name"] == "LangChain Labs"
    assert entry["role_title"] == "AI Engineer Intern"
    assert entry["resume_version"] == 2
    assert "created_at" in entry
    # Security: the server-side file path must never leak to the browser.
    assert "resume_path" not in entry


def test_empty_library_returns_empty_list(client: TestClient):
    """User with applications but no generated resumes → empty list."""
    db = TestingSessionLocal()
    user = User(
        id=2,
        name="No Resumes",
        email="no-resumes@example.com",
        mode="internship",
        weekly_quota=5,
        confirmation_mode="batch",
    )
    db.add(user)
    db.commit()
    db.close()

    response = client.get("/applications/2/resumes")

    assert response.status_code == 200, response.text
    assert response.json() == []


def test_404_for_unknown_user(client: TestClient):
    """Unknown user_id → clean 404, not an empty list."""
    response = client.get("/applications/999/resumes")
    assert response.status_code == 404
    assert "user not found" in response.json()["detail"].lower()

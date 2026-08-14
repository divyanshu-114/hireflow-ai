"""
Tests for the prep-guide retrieval route (Issue 25 addition).

GET /prep-guide/{application_id} returns the full PrepGuide row with its
JSON-string columns parsed into objects plus Job context. It must return
a clean 404 when no guide exists yet for that application (an expected
case, not a bug).

Follows the test_resume_route.py pattern: in-memory SQLite with a
per-test dependency override — no real Postgres, no live network.
"""

from __future__ import annotations

import json
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
from src.models.prep_guide import PrepGuide  # noqa: E402
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

    Installed per-test and restored afterwards (not at module import) so
    this file can never clobber test_profile_api.py's global override.
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


def _seed(db: Session, *, with_guide: bool = True, corrupt: bool = False) -> None:
    """Seed a user + job + application (+ optional prep guide)."""
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

    app_row = Application(
        id=1,
        user_id=1,
        job_id=1,
        status="applied",
        applied_at=datetime.utcnow(),
    )
    db.add(app_row)
    db.commit()

    if with_guide:
        rounds = {
            "round_count": 2,
            "source": "inferred",
            "rounds": [
                {
                    "number": 1,
                    "type": "technical",
                    "label": "Technical Interview",
                    "focus": ["Coding", "System design"],
                    "duration_minutes": 60,
                    "tips": ["Explain your thought process out loud."],
                },
                {
                    "number": 2,
                    "type": "hr",
                    "label": "HR Round",
                    "focus": ["Communication", "Culture fit"],
                    "duration_minutes": 30,
                    "tips": ["Research the company mission."],
                },
            ],
        }
        topics = {"strong": ["Python"], "moderate": ["FastAPI"], "gaps": ["Docker"]}
        resources = {
            "Docker": [
                {
                    "title": "Docker Official Docs",
                    "url": "https://docs.docker.com/get-started/",
                    "type": "docs",
                }
            ]
        }
        questions = [
            {"question": "Explain how RAG works.", "category": "technical"},
            {"question": "Why do you want to work here?", "category": "behavioral"},
        ]
        intel = {
            "stage": "series_a",
            "tech_stack": ["Python", "LangChain"],
            "recent_news": [],
            "interview_patterns": ["2 rounds, technical then HR"],
            "interview_patterns_note": "No interview reviews found.",
            "key_people": [],
            "summary": "LangChain Labs appears to be a Series A company.",
            "sources_checked": [],
            "researched_at": "2026-08-01T00:00:00",
        }

        def _ser(value):
            if corrupt:
                return "{not valid json"
            return json.dumps(value)

        guide = PrepGuide(
            id=1,
            application_id=1,
            company_name="",  # deliberately empty — route should use Job context
            role_title="",
            interview_rounds=_ser(rounds),
            topics_to_prepare=_ser(topics),
            resources=_ser(resources),
            mock_questions=_ser(questions),
            company_intel=_ser(intel),
            created_at=datetime.utcnow(),
        )
        db.add(guide)
        db.commit()


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


def test_returns_full_guide_with_parsed_fields(client: TestClient):
    """Happy path: guide returned with JSON columns parsed into objects."""
    db = TestingSessionLocal()
    _seed(db)
    db.close()

    response = client.get("/prep-guide/1")

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["application_id"] == 1
    # Job context preferred over the guide's own empty company/role columns.
    assert data["company_name"] == "LangChain Labs"
    assert data["role_title"] == "AI Engineer Intern"
    # JSON-string columns parsed into real objects.
    assert data["interview_rounds"]["round_count"] == 2
    assert data["interview_rounds"]["rounds"][0]["type"] == "technical"
    assert data["topics_to_prepare"]["strong"] == ["Python"]
    assert data["topics_to_prepare"]["gaps"] == ["Docker"]
    assert data["resources"]["Docker"][0]["url"].startswith("https://")
    assert data["mock_questions"][0]["category"] == "technical"
    assert data["company_intel"]["stage"] == "series_a"


def test_404_when_no_guide_exists(client: TestClient):
    """No PrepGuide row for the application → clean 404, not a crash."""
    db = TestingSessionLocal()
    _seed(db, with_guide=False)
    db.close()

    response = client.get("/prep-guide/1")

    assert response.status_code == 404
    assert "not ready yet" in response.json()["detail"].lower()


def test_404_for_unknown_application(client: TestClient):
    """Application id that doesn't exist → 404 with the same message."""
    response = client.get("/prep-guide/999")
    assert response.status_code == 404
    assert "not ready yet" in response.json()["detail"].lower()


def test_corrupt_json_degrades_to_none(client: TestClient):
    """A corrupt JSON-string column → None for that field, no crash."""
    db = TestingSessionLocal()
    _seed(db, corrupt=True)
    db.close()

    response = client.get("/prep-guide/1")

    assert response.status_code == 200, response.text
    data = response.json()
    # Every field was seeded as invalid JSON → all degrade to None.
    assert data["interview_rounds"] is None
    assert data["topics_to_prepare"] is None
    assert data["mock_questions"] is None
    assert data["company_intel"] is None
    # Non-JSON columns still intact.
    assert data["company_name"] == "LangChain Labs"

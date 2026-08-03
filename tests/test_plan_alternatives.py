"""
Tests for the weekly-plan alternatives endpoint (Issue 24 addition).

GET /weekly-plan/{user_id}/alternatives returns scored-but-not-planned
applications (the swap candidates the frontend offers as the "next
ranked alternative"). Follows the test_quota_selector.py pattern:
in-memory SQLite with hand-created tables and SessionLocal patched on
the route module.

Run:
    pytest tests/test_plan_alternatives.py -v
"""

from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.api.main import app
from src.api.routes import weekly_plan as weekly_plan_module
from src.models.job import Job
from src.models.user import User
from src.pipelines.quota_selector import QuotaSelector, _current_week_monday


def _create_test_tables(engine) -> None:
    """Create the minimal schema needed for these route tests."""
    with engine.begin() as conn:
        conn.exec_driver_sql("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                name VARCHAR NOT NULL,
                email VARCHAR NOT NULL UNIQUE,
                mode VARCHAR NOT NULL,
                master_profile TEXT,
                weekly_quota INTEGER NOT NULL DEFAULT 5,
                confirmation_mode VARCHAR NOT NULL DEFAULT 'batch',
                created_at DATETIME
            )
            """)
        conn.exec_driver_sql("""
            CREATE TABLE jobs (
                id INTEGER PRIMARY KEY,
                company_name VARCHAR NOT NULL,
                role_title VARCHAR NOT NULL,
                jd_text VARCHAR NOT NULL,
                skills_required VARCHAR,
                experience_required VARCHAR,
                location VARCHAR,
                stipend_salary VARCHAR,
                application_url VARCHAR NOT NULL,
                posting_date DATETIME,
                selection_process VARCHAR,
                source VARCHAR NOT NULL,
                listing_type VARCHAR NOT NULL,
                is_spam BOOLEAN DEFAULT 0,
                spam_confidence FLOAT,
                created_at DATETIME
            )
            """)
        conn.exec_driver_sql("""
            CREATE TABLE applications (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                job_id INTEGER NOT NULL REFERENCES jobs(id),
                match_score FLOAT,
                skill_gaps VARCHAR,
                skill_matches VARCHAR,
                rank INTEGER,
                cycle_start_date DATE,
                resume_path VARCHAR,
                resume_version INTEGER,
                status VARCHAR NOT NULL DEFAULT 'pending',
                failure_reason VARCHAR,
                applied_at DATETIME,
                created_at DATETIME
            )
            """)


@pytest.fixture()
def api_context():
    """Fresh in-memory DB with SessionLocal patched onto the route module."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    _create_test_tables(engine)
    TestSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

    original = weekly_plan_module.SessionLocal
    weekly_plan_module.SessionLocal = TestSessionLocal

    yield TestSessionLocal

    weekly_plan_module.SessionLocal = original


def _insert_user(db: Session, *, id: int = 1, weekly_quota: int = 5) -> User:
    db.execute(
        text(
            "INSERT INTO users (id, name, email, mode, master_profile, "
            "weekly_quota, confirmation_mode, created_at) "
            "VALUES (:id, :name, :email, 'internship', NULL, :quota, 'batch', :ca)"
        ),
        {
            "id": id,
            "name": f"User {id}",
            "email": f"user{id}@example.com",
            "quota": weekly_quota,
            "ca": datetime.utcnow(),
        },
    )
    db.commit()
    return db.query(User).filter(User.id == id).first()


def _insert_job(db: Session, *, id: int, company: str) -> Job:
    db.execute(
        text(
            "INSERT INTO jobs (id, company_name, role_title, jd_text, "
            "application_url, source, listing_type, posting_date) "
            "VALUES (:id, :cn, :rt, :jd, :au, 'test', 'internship', :pd)"
        ),
        {
            "id": id,
            "cn": company,
            "rt": f"Role {id}",
            "jd": "A test job description.",
            "au": "https://example.com/apply",
            "pd": datetime.utcnow(),
        },
    )
    db.commit()
    return db.query(Job).filter(Job.id == id).first()


def _insert_application(
    db: Session,
    *,
    id: int,
    user_id: int = 1,
    job_id: int,
    rank: int,
    status: str = "pending",
    cycle_start_date=None,
) -> None:
    db.execute(
        text(
            "INSERT INTO applications (id, user_id, job_id, match_score, "
            "skill_gaps, skill_matches, rank, cycle_start_date, status, "
            "created_at) VALUES (:id, :uid, :jid, :ms, '[]', '[]', :rk, :csd, :st, :ca)"
        ),
        {
            "id": id,
            "uid": user_id,
            "jid": job_id,
            "ms": 0.9 - (rank * 0.05),
            "rk": rank,
            "csd": cycle_start_date,
            "st": status,
            "ca": datetime.utcnow(),
        },
    )
    db.commit()


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


def test_returns_pending_apps_not_in_plan(api_context):
    """Alternatives = pending scored apps outside the current plan, by rank."""
    TestSessionLocal = api_context
    db = TestSessionLocal()
    _insert_user(db, id=1, weekly_quota=2)
    for jid in range(1, 6):
        _insert_job(db, id=jid, company=f"Company{jid}")
        _insert_application(db, id=jid, job_id=jid, rank=jid, status="pending")
    # Generate a plan → jobs 1,2 become planned; 3,4,5 stay pending.
    QuotaSelector(db=db).generate_weekly_plan(1)
    db.close()

    with TestClient(app) as client:
        response = client.get("/weekly-plan/1/alternatives")

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["user_id"] == 1
    assert data["total_count"] == 3
    alt_ids = [alt["job_id"] for alt in data["alternatives"]]
    assert alt_ids == [3, 4, 5], f"Expected rank order [3,4,5], got {alt_ids}"
    assert all(alt["status"] == "pending" for alt in data["alternatives"])


def test_empty_when_no_pending_apps(api_context):
    """No pending apps at all → empty alternatives, not a crash."""
    TestSessionLocal = api_context
    db = TestSessionLocal()
    _insert_user(db, id=1)
    db.close()

    with TestClient(app) as client:
        response = client.get("/weekly-plan/1/alternatives")

    assert response.status_code == 200
    data = response.json()
    assert data["alternatives"] == []
    assert data["total_count"] == 0


def test_excludes_currently_planned_jobs(api_context):
    """A planned job must never be offered as an alternative."""
    TestSessionLocal = api_context
    db = TestSessionLocal()
    _insert_user(db, id=1, weekly_quota=2)
    cycle = _current_week_monday()
    for jid in range(1, 5):
        _insert_job(db, id=jid, company=f"Company{jid}")
        _insert_application(
            db,
            id=jid,
            job_id=jid,
            rank=jid,
            status="pending" if jid > 2 else "planned",
            cycle_start_date=cycle if jid <= 2 else None,
        )
    db.close()

    with TestClient(app) as client:
        data = client.get("/weekly-plan/1/alternatives").json()

    alt_ids = {alt["job_id"] for alt in data["alternatives"]}
    assert alt_ids == {3, 4}


def test_404_for_unknown_user(api_context):
    """Unknown user_id → 404 like the other weekly-plan routes."""
    with TestClient(app) as client:
        response = client.get("/weekly-plan/999/alternatives")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

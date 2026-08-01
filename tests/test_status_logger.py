import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from src.models.user import User, ApplicationMode
from src.models.job import Job
from src.models.application import Application, ApplicationStatusLog
from src.utils.status_logger import StatusLogger


def _create_test_tables(engine):
    """
    Create the test schema on SQLite using hand-written DDL.

    The real models use Postgres-only types (JSONB for master_profile, native
    Enum for mode), so Base.metadata.create_all() cannot build them on SQLite.
    This mirrors the established pattern in tests/test_quota_selector.py and
    tests/test_matcher.py: an isolated in-memory DB immune to leftover state
    in the shared development Postgres database.
    """
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
        conn.exec_driver_sql("""
            CREATE TABLE application_status_logs (
                id INTEGER PRIMARY KEY,
                application_id INTEGER NOT NULL REFERENCES applications(id),
                status VARCHAR NOT NULL,
                reason VARCHAR,
                created_at DATETIME
            )
            """)


@pytest.fixture(scope="module")
def db_session():
    """Isolated in-memory SQLite database — never touches the real Postgres DB."""
    engine = create_engine("sqlite:///:memory:")
    _create_test_tables(engine)
    TestSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
    db = TestSessionLocal()
    yield db
    db.close()


@pytest.fixture
def setup_data(db_session: Session):
    uid = str(uuid.uuid4())
    user = User(
        name="Test User",
        email=f"test_{uid}@example.com",
        mode=ApplicationMode.job,
        master_profile={},
    )
    db_session.add(user)
    db_session.commit()

    job = Job(
        company_name="Test Co",
        role_title="Engineer",
        jd_text="Do things",
        application_url="http://test.co/apply",
        source="test",
        listing_type="job",
    )
    db_session.add(job)
    db_session.commit()

    app = Application(user_id=user.id, job_id=job.id, status="pending")
    db_session.add(app)
    db_session.commit()

    return {"user": user, "job": job, "app": app}


def test_status_logger_applied(db_session: Session, setup_data: dict):
    app_id = setup_data["app"].id

    StatusLogger.log_status(db_session, app_id, "applied")

    # Check application update
    app = db_session.query(Application).filter_by(id=app_id).first()
    assert app.status == "applied"
    assert app.applied_at is not None

    # Check audit log
    logs = db_session.query(ApplicationStatusLog).filter_by(application_id=app_id).all()
    assert len(logs) == 1
    assert logs[0].status == "applied"


def test_status_logger_failed(db_session: Session, setup_data: dict):
    app_id = setup_data["app"].id

    StatusLogger.log_status(db_session, app_id, "failed", reason="Form error")

    # Check application update
    app = db_session.query(Application).filter_by(id=app_id).first()
    assert app.status == "failed"
    assert app.failure_reason == "Form error"

    # Check audit log
    logs = (
        db_session.query(ApplicationStatusLog)
        .filter_by(application_id=app_id)
        .order_by(ApplicationStatusLog.id.desc())
        .all()
    )
    assert logs[0].status == "failed"
    assert logs[0].reason == "Form error"


def test_status_logger_needs_action(db_session: Session, setup_data: dict):
    app_id = setup_data["app"].id

    StatusLogger.log_status(
        db_session, app_id, "needs_action", reason="Captcha required"
    )

    # Check application update
    app = db_session.query(Application).filter_by(id=app_id).first()
    assert app.status == "needs_action"
    assert app.failure_reason == "Captcha required"

    # Check audit log
    logs = (
        db_session.query(ApplicationStatusLog)
        .filter_by(application_id=app_id)
        .order_by(ApplicationStatusLog.id.desc())
        .all()
    )
    assert logs[0].status == "needs_action"
    assert logs[0].reason == "Captcha required"

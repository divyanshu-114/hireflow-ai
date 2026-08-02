"""Tests for the Hiring Side Shortlist Agent (Issue 22).

Deterministic, LLM-free scoring — no live API calls anywhere. Uses an
isolated in-memory SQLite database for the save_shortlist tests, following
the established project pattern (hand-written DDL because the models use
Postgres-only JSONB).
"""

from __future__ import annotations

from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.agents.hiring_shortlist_agent import HiringShortlistAgent, extract_jd_skills
from src.api.main import app
from src.api.routes import hiring as hiring_module
from src.models.shortlist import Shortlist

# ====================================================================== #
# Test fixtures
# ====================================================================== #


@pytest.fixture
def agent() -> HiringShortlistAgent:
    return HiringShortlistAgent()


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Isolated in-memory SQLite database with a shortlists table."""
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql("""
            CREATE TABLE shortlists (
                id INTEGER PRIMARY KEY,
                jd_text VARCHAR NOT NULL,
                shortlist_size INTEGER,
                results TEXT,
                created_at DATETIME
            )
            """)
    TestSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
    db = TestSessionLocal()
    yield db
    db.close()


# ====================================================================== #
# Helpers
# ====================================================================== #


def _make_applicant(name: str, skills: list[str]) -> dict:
    return {"name": name, "skills": skills}


# ====================================================================== #
# Test: score_applicant
# ====================================================================== #


class TestScoreApplicant:
    def test_perfect_match_scores_1(self, agent: HiringShortlistAgent):
        result = agent.score_applicant(
            "JD text",
            ["langchain", "python", "rag"],
            _make_applicant("C", ["RAG", "Python", "LangChain"]),
        )
        assert result["name"] == "C"
        assert result["score"] == 1.0
        assert set(result["matched_skills"]) == {"langchain", "python", "rag"}
        assert result["skill_gaps"] == []

    def test_partial_match_scores_fraction(self, agent: HiringShortlistAgent):
        result = agent.score_applicant(
            "JD text",
            ["langchain", "python", "rag"],
            _make_applicant("A", ["Python", "Java"]),
        )
        assert result["score"] == pytest.approx(1 / 3, abs=0.001)
        assert result["matched_skills"] == ["python"]
        assert result["skill_gaps"] == ["langchain", "rag"]

    def test_zero_overlap_scores_zero(self, agent: HiringShortlistAgent):
        result = agent.score_applicant(
            "JD text",
            ["langchain", "python", "rag"],
            _make_applicant("B", ["Java", "Spring", "SQL"]),
        )
        assert result["score"] == 0.0
        assert result["matched_skills"] == []
        assert result["skill_gaps"] == ["langchain", "python", "rag"]

    def test_missing_skills_key_no_crash(self, agent: HiringShortlistAgent):
        # No "skills" key at all — treated as empty list, score 0, no crash.
        result = agent.score_applicant("JD text", ["python"], {"name": "NoSkills"})
        assert result["score"] == 0.0
        assert result["matched_skills"] == []
        assert result["skill_gaps"] == ["python"]

    def test_empty_jd_skills_neutral(self, agent: HiringShortlistAgent):
        # Mirrors Issue 10: no JD skills -> neutral 0.5, not a crash.
        result = agent.score_applicant("JD text", [], _make_applicant("A", ["Python"]))
        assert result["score"] == 0.5


# ====================================================================== #
# Test: jd_skills extraction
# ====================================================================== #


class TestExtractJdSkills:
    def test_extracts_from_structured_line(self):
        jd = "We need an AI engineer.\nSkills: Python, LangChain, RAG\nApply now!"
        assert extract_jd_skills(jd) == ["python", "langchain", "rag"]

    def test_extracts_from_prose_via_catalogue(self):
        jd = "We are building RAG pipelines with LangChain and Python."
        skills = extract_jd_skills(jd)
        assert "python" in skills
        assert "langchain" in skills
        assert "rag" in skills

    def test_empty_jd_returns_empty(self):
        assert extract_jd_skills("") == []
        assert extract_jd_skills(None) == []
        assert extract_jd_skills("   ") == []

    def test_deterministic_output(self):
        jd = "Skills: React, Python, SQL"
        assert extract_jd_skills(jd) == extract_jd_skills(jd)


# ====================================================================== #
# Test: shortlist
# ====================================================================== #


class TestShortlist:
    JD = "We are hiring for a RAG role.\nSkills: LangChain, Python, RAG"

    def test_basic_ranking_issue_example(self, agent: HiringShortlistAgent):
        """Issue's own example: C (full match) > A (partial) > B (zero)."""
        applicants = [
            _make_applicant("Student A", ["Python", "Java"]),
            _make_applicant("Student B", ["Java", "Spring", "SQL"]),
            _make_applicant("Student C", ["LangChain", "Python", "RAG"]),
        ]
        result = agent.shortlist(self.JD, applicants, shortlist_size=2)

        assert result["total_applicants"] == 3
        assert result["jd_skills_extracted"] == ["langchain", "python", "rag"]
        names = [entry["name"] for entry in result["shortlist"]]
        assert names == ["Student C", "Student A"]
        assert result["shortlist"][0]["score"] == 1.0
        assert result["shortlist"][1]["score"] == pytest.approx(1 / 3, abs=0.001)

    def test_tie_breaks_alphabetically(self, agent: HiringShortlistAgent):
        """Identical skills -> identical scores -> alphabetical by name."""
        applicants = [
            _make_applicant("Zoe", ["Python"]),
            _make_applicant("Amy", ["Python"]),
            _make_applicant("Mia", ["Python"]),
        ]
        result = agent.shortlist(self.JD, applicants, shortlist_size=3)
        names = [entry["name"] for entry in result["shortlist"]]
        assert names == ["Amy", "Mia", "Zoe"]

    def test_empty_applicants(self, agent: HiringShortlistAgent):
        result = agent.shortlist(self.JD, [], shortlist_size=5)
        assert result == {
            "shortlist": [],
            "total_applicants": 0,
            "jd_skills_extracted": ["langchain", "python", "rag"],
        }

    def test_shortlist_size_larger_than_pool(self, agent: HiringShortlistAgent):
        applicants = [_make_applicant("A", ["Python"]), _make_applicant("B", ["SQL"])]
        result = agent.shortlist(self.JD, applicants, shortlist_size=10)
        assert len(result["shortlist"]) == 2
        assert result["total_applicants"] == 2

    def test_shortlist_size_zero_or_negative_raises(self, agent: HiringShortlistAgent):
        applicants = [_make_applicant("A", ["Python"])]
        with pytest.raises(ValueError, match="positive integer"):
            agent.shortlist(self.JD, applicants, shortlist_size=0)
        with pytest.raises(ValueError, match="positive integer"):
            agent.shortlist(self.JD, applicants, shortlist_size=-3)

    def test_no_matching_candidates_still_ranked(self, agent: HiringShortlistAgent):
        """JD requires skills nobody has — ranked zero-score list, not an error."""
        applicants = [
            _make_applicant("Alice", ["Java"]),
            _make_applicant("Bob", ["C++"]),
        ]
        result = agent.shortlist(self.JD, applicants, shortlist_size=2)
        assert len(result["shortlist"]) == 2
        assert all(entry["score"] == 0.0 for entry in result["shortlist"])
        # Deterministic tiebreaker: alphabetical by name at equal (zero) scores.
        assert [entry["name"] for entry in result["shortlist"]] == ["Alice", "Bob"]

    def test_applicant_missing_skills_key_in_shortlist(
        self, agent: HiringShortlistAgent
    ):
        applicants = [_make_applicant("A", ["Python"]), {"name": "B"}]
        result = agent.shortlist(self.JD, applicants, shortlist_size=2)
        assert len(result["shortlist"]) == 2
        assert result["shortlist"][0]["name"] == "A"
        assert result["shortlist"][0]["score"] == pytest.approx(1 / 3, abs=0.001)


# ====================================================================== #
# Test: save_shortlist
# ====================================================================== #


class TestSaveShortlist:
    def test_saves_and_retrieves_row(
        self, agent: HiringShortlistAgent, db_session: Session
    ):
        # JD with extractable skills so the JSONB roundtrip is non-trivial.
        jd_text = "Skills: Python, LangChain"
        result = agent.shortlist(
            jd_text,
            [
                _make_applicant("Alice", ["Python", "LangChain"]),
                _make_applicant("Bob", ["Java"]),
            ],
            shortlist_size=2,
        )
        shortlist_id = agent.save_shortlist(db_session, jd_text, 2, result)

        assert isinstance(shortlist_id, int)
        row = db_session.query(Shortlist).filter(Shortlist.id == shortlist_id).first()
        assert row is not None
        assert row.jd_text == jd_text
        assert row.shortlist_size == 2
        assert row.results == result["shortlist"]
        # Non-trivial JSONB content survives the roundtrip.
        assert row.results[0]["name"] == "Alice"
        assert row.results[0]["score"] == 1.0
        assert row.results[1]["name"] == "Bob"
        assert row.results[1]["score"] == 0.0


# ====================================================================== #
# Test: API routes (TestClient, patched SessionLocal)
# ====================================================================== #


class TestHiringAPI:
    def _patch_db(self, monkeypatch):
        """Point the hiring route's SessionLocal at an in-memory DB.

        Uses StaticPool + check_same_thread=False because the TestClient
        runs the app in a separate thread: with a plain ``:memory:`` engine
        each connection would get its own empty database.
        """
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with engine.begin() as conn:
            conn.exec_driver_sql("""
                CREATE TABLE shortlists (
                    id INTEGER PRIMARY KEY,
                    jd_text VARCHAR NOT NULL,
                    shortlist_size INTEGER,
                    results TEXT,
                    created_at DATETIME
                )
                """)
        TestSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
        monkeypatch.setattr(hiring_module, "SessionLocal", TestSessionLocal)

    def test_json_endpoint(self, monkeypatch):
        self._patch_db(monkeypatch)
        with TestClient(app) as client:
            resp = client.post(
                "/hiring/shortlist",
                json={
                    "jd_text": "Skills: Python, LangChain",
                    "applicants": [
                        {"name": "Alice", "skills": ["Python", "LangChain"]},
                        {"name": "Bob", "skills": ["Java"]},
                    ],
                    "shortlist_size": 1,
                },
            )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "shortlist_id" in data
        assert data["total_applicants"] == 2
        assert data["shortlist"][0]["name"] == "Alice"

    def test_json_endpoint_invalid_shortlist_size(self, monkeypatch):
        self._patch_db(monkeypatch)
        with TestClient(app) as client:
            resp = client.post(
                "/hiring/shortlist",
                json={"jd_text": "JD", "applicants": [], "shortlist_size": 0},
            )
        assert resp.status_code == 400
        assert "positive integer" in resp.json()["detail"]

    def test_json_endpoint_empty_jd(self, monkeypatch):
        self._patch_db(monkeypatch)
        with TestClient(app) as client:
            resp = client.post(
                "/hiring/shortlist",
                json={"jd_text": "  ", "applicants": [], "shortlist_size": 1},
            )
        assert resp.status_code == 400
        assert "jd_text must not be empty" in resp.json()["detail"]

    def test_csv_endpoint(self, monkeypatch):
        self._patch_db(monkeypatch)
        # skills is a comma-separated string INSIDE a quoted CSV cell
        csv_content = 'name,skills\nAlice,"Python, LangChain"\nBob,"Java"\n'
        with TestClient(app) as client:
            resp = client.post(
                "/hiring/shortlist/csv",
                data={"jd_text": "Skills: Python, LangChain", "shortlist_size": 2},
                files={"file": ("applicants.csv", csv_content, "text/csv")},
            )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total_applicants"] == 2
        # Alice matches Python + LangChain -> 2/2, ranks first.
        assert data["shortlist"][0]["name"] == "Alice"
        assert data["shortlist"][0]["score"] == 1.0
        # Bob (Java) scores 0 but is still included (ranked, zero score).
        assert data["shortlist"][1]["name"] == "Bob"

    def test_multipart_csv_on_main_path(self, monkeypatch):
        """Regression: the real curl scenario (multipart -> /hiring/shortlist).

        Previously the main path was JSON-only, so a multipart upload 422'd
        with ``model_attributes_type``. It must now dispatch on Content-Type
        and accept the CSV upload exactly like the explicit CSV route.
        """
        self._patch_db(monkeypatch)
        csv_content = 'name,skills\nAlice,"Python, LangChain"\nBob,"Java"\n'
        with TestClient(app) as client:
            resp = client.post(
                "/hiring/shortlist",
                data={"jd_text": "Skills: Python, LangChain", "shortlist_size": 2},
                files={"file": ("applicants.csv", csv_content, "text/csv")},
            )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total_applicants"] == 2
        # Alice matches Python + LangChain -> 2/2, ranks first.
        assert data["shortlist"][0]["name"] == "Alice"
        assert data["shortlist"][0]["score"] == 1.0
        # Bob (Java) scores 0 but is still included (ranked, zero score).
        assert data["shortlist"][1]["name"] == "Bob"

    def test_multipart_main_path_missing_file(self, monkeypatch):
        """Multipart to /hiring/shortlist without a file -> clear 400."""
        self._patch_db(monkeypatch)
        with TestClient(app) as client:
            resp = client.post(
                "/hiring/shortlist",
                data={"jd_text": "Skills: Python", "shortlist_size": 1},
            )
        assert resp.status_code == 400
        assert "file" in resp.json()["detail"].lower()

    def test_multipart_main_path_bad_shortlist_size(self, monkeypatch):
        """Non-integer shortlist_size in multipart -> clear 400."""
        self._patch_db(monkeypatch)
        csv_content = 'name,skills\nAlice,"Python"\n'
        with TestClient(app) as client:
            resp = client.post(
                "/hiring/shortlist",
                data={"jd_text": "Skills: Python", "shortlist_size": "abc"},
                files={"file": ("applicants.csv", csv_content, "text/csv")},
            )
        assert resp.status_code == 400
        assert "shortlist_size" in resp.json()["detail"]

    def test_csv_endpoint_missing_columns(self, monkeypatch):
        self._patch_db(monkeypatch)
        csv_content = "full_name,langs\nAlice,Python\n"
        with TestClient(app) as client:
            resp = client.post(
                "/hiring/shortlist/csv",
                data={"jd_text": "JD", "shortlist_size": 1},
                files={"file": ("applicants.csv", csv_content, "text/csv")},
            )
        assert resp.status_code == 400
        assert "name" in resp.json()["detail"] and "skills" in resp.json()["detail"]

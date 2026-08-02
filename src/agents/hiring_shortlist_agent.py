"""HireFlow AI — Hiring Side Shortlist Agent (Issue 22).

Flips the core matching engine (Issue 10) around: a company submits a job
description plus a pool of ad-hoc applicant profiles (name + skills) and
receives a deterministic, LLM-free ranked shortlist of the top N candidates.

Scoring mirrors ``MatchScorer._skill_match_score()`` from Issue 10:

  - Skills are normalized (strip + lowercase) for case-insensitive set overlap.
  - ``score = |matched| / |jd_skills|`` (0-1).
  - ``matched_skills`` and ``skill_gaps`` use the same terminology as Issue 10.
  - If the JD lists no extractable skills, a neutral 0.5 is returned (the same
    "no skills listed in JD" convention used by Issue 10), so a shortlist is
    still produced rather than collapsing to zeros.

Why this does NOT call ``MatchScorer`` directly: Issue 10's scorer is built
around DB-stored User/Job/Application rows and a FAISS embedding index. The
applicants here are plain dicts that may never touch the database, and there
is no embedding index for them, so the reusable scoring logic is factored
into a module-level pure helper (``_skill_overlap``) that operates on plain
skill lists. The embedding blend is intentionally omitted — this issue
requires deterministic, index-free, explainable scoring.

No LLM calls anywhere — everything here is pure Python.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Tuple

from src.models.shortlist import Shortlist

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Curated technology keyword catalogue for deterministic JD skill extraction
# --------------------------------------------------------------------------- #
# Used to pull skills out of raw, unstructured JD prose without an LLM.
# Terms are matched case-insensitively with word boundaries; the catalogue
# order defines the output order (deterministic across runs).
_TECH_CATALOGUE: List[str] = [
    # Languages
    "python",
    "java",
    "javascript",
    "typescript",
    "golang",
    "rust",
    "c++",
    "c#",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "scala",
    "sql",
    "html",
    "css",
    "bash",
    "shell",
    # Web frameworks / libraries
    "react",
    "react native",
    "vue",
    "angular",
    "next.js",
    "node.js",
    "express",
    "django",
    "flask",
    "fastapi",
    "spring",
    "spring boot",
    "laravel",
    "rails",
    "tailwind",
    "bootstrap",
    "graphql",
    "rest",
    "rest api",
    # ML / AI / RAG
    "langchain",
    "langgraph",
    "rag",
    "llm",
    "machine learning",
    "deep learning",
    "tensorflow",
    "pytorch",
    "numpy",
    "pandas",
    "scikit-learn",
    "hugging face",
    "transformers",
    "nlp",
    "computer vision",
    "genai",
    "fine-tuning",
    "embeddings",
    "vector database",
    "faiss",
    # Data / databases
    "postgresql",
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "sqlite",
    "dynamodb",
    "cassandra",
    "elasticsearch",
    "kafka",
    "spark",
    "hadoop",
    "airflow",
    "etl",
    "data analysis",
    "data engineering",
    "data science",
    # Cloud / DevOps
    "aws",
    "azure",
    "gcp",
    "google cloud",
    "docker",
    "kubernetes",
    "terraform",
    "jenkins",
    "github actions",
    "ci/cd",
    "git",
    "linux",
    "nginx",
    "microservices",
    "serverless",
    # Testing / tools
    "pytest",
    "jest",
    "junit",
    "selenium",
    "playwright",
    "cypress",
    "jira",
    "agile",
    "scrum",
    # Domain / misc
    "excel",
    "tableau",
    "power bi",
    "figma",
    "web scraping",
    "beautifulsoup",
    "scrapy",
]

# Tokens that would never be a skill — filtered from structured skill lines.
_SKILL_STOPWORDS = frozenset(
    {
        "and",
        "the",
        "or",
        "with",
        "for",
        "in",
        "on",
        "to",
        "of",
        "years",
        "experience",
        "knowledge",
        "ability",
        "plus",
        "etc",
    }
)


def extract_jd_skills(jd_text: str) -> List[str]:
    """Deterministically extract a lowercased skill list from raw JD text.

    Two complementary, LLM-free mechanisms:

    1. **Structured section parsing** — lines like ``Skills: Python, LangChain``
       or ``Requirements: - React - Node`` are split on common delimiters
       (commas, semicolons, pipes, bullets).
    2. **Catalogue scan** — the curated ``_TECH_CATALOGUE`` is matched with
       word boundaries across the entire text, catching skills mentioned in
       prose (e.g. "we are building RAG pipelines with LangChain").

    Results are deduplicated preserving first-appearance order, so identical
    input always yields an identical list (deterministic / reproducible).
    """
    if not jd_text or not jd_text.strip():
        return []

    text = jd_text.lower()
    found: List[str] = []

    # --- 1. Structured skill lines --------------------------------------- #
    section_header = re.compile(
        r"^\s*(?:skills?|tech(?:nical)?\s*stack|technologies?|"
        r"requirements?|must\s+have|nice\s+to\s+have|qualifications?)"
        r"\s*[:|\-–·]\s*(.*)$",
        re.IGNORECASE,
    )
    for line in text.splitlines():
        match = section_header.match(line)
        if not match:
            continue
        content = match.group(1)
        for token in re.split(r"[,;|·/]+", content):
            token = token.strip().strip(".-–— ").strip()
            if not token or len(token) < 2 or len(token) > 50:
                continue
            if token.isdigit():
                continue
            if token in _SKILL_STOPWORDS:
                continue
            if token not in found:
                found.append(token)

    # --- 2. Catalogue word-boundary scan ---------------------------------- #
    for term in _TECH_CATALOGUE:
        if term in found:
            continue
        pattern = r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z0-9])"
        if re.search(pattern, text):
            found.append(term)

    return found


def _skill_overlap(
    user_skills: List[str], jd_skills: List[str]
) -> Tuple[float, List[str], List[str]]:
    """Pure set-overlap skill scoring mirroring Issue 10's logic.

    Mirrors ``MatchScorer._skill_match_score``'s set component (normalize ->
    intersect -> ``len(matches) / len(jd_skills)``) but operates on plain
    lists instead of DB rows, and omits the FAISS embedding blend (applicants
    here are ad-hoc and never indexed).

    Returns (score, matched_skills, skill_gaps) with matches/gaps sorted,
    matching Issue 10's terminology and output style.
    """
    user_set = set()
    for s in user_skills or []:
        normalized = s.strip().lower()
        if normalized:
            user_set.add(normalized)

    jd_set = set(jd_skills or [])

    if not jd_set:
        # No skills listed in JD — neutral score (Issue 10 convention).
        return 0.5, [], []

    matches = user_set & jd_set
    gaps = jd_set - user_set
    score = len(matches) / len(jd_set)
    return round(score, 4), sorted(matches), sorted(gaps)


class HiringShortlistAgent:
    """Deterministic, LLM-free shortlist scoring of ad-hoc applicants."""

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def score_applicant(
        self,
        jd_text: str,
        jd_skills: List[str],
        applicant: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Score a single applicant dict against the JD's required skills.

        ``applicant`` must contain at minimum ``{"name": str}``; a missing or
        empty ``"skills"`` key is treated as an empty list (score 0) rather
        than crashing.

        Returns ``{"name", "score", "matched_skills", "skill_gaps"}``.
        """
        # ``jd_text`` is part of the public signature for interface symmetry
        # with ``shortlist()``; scoring itself only needs the pre-extracted
        # ``jd_skills`` list, so the raw text is intentionally unused here.
        name_raw = applicant.get("name")
        name = str(name_raw).strip() if name_raw not in (None, "") else "Unknown"

        skills_raw = applicant.get("skills") or []
        if isinstance(skills_raw, str):
            applicant_skills = [s.strip() for s in skills_raw.split(",") if s.strip()]
        elif isinstance(skills_raw, list):
            applicant_skills = skills_raw
        else:
            applicant_skills = []

        score, matches, gaps = _skill_overlap(applicant_skills, jd_skills)

        return {
            "name": name,
            "score": score,
            "matched_skills": matches,
            "skill_gaps": gaps,
        }

    def shortlist(
        self,
        jd_text: str,
        applicants: List[Dict[str, Any]],
        shortlist_size: int,
    ) -> Dict[str, Any]:
        """Score all applicants against the JD and return the top N.

        Edge cases:
        - ``shortlist_size <= 0`` -> raises ValueError.
        - Empty applicant list -> ``{"shortlist": [], "total_applicants": 0}``.
        - ``shortlist_size`` > pool size -> returns however many exist.
        - No applicant scores above 0 -> still returns the ranked list
          (a company may still want to see who is closest).

        Sorting is deterministic: score descending, then name ascending
        (case-insensitive) for ties.
        """
        if shortlist_size <= 0:
            raise ValueError(
                f"shortlist_size must be a positive integer, got {shortlist_size}."
            )

        jd_skills = extract_jd_skills(jd_text)

        if not applicants:
            return {
                "shortlist": [],
                "total_applicants": 0,
                "jd_skills_extracted": jd_skills,
            }

        scored = [
            self.score_applicant(jd_text, jd_skills, applicant)
            for applicant in applicants
        ]

        scored.sort(
            key=lambda entry: (-entry["score"], entry["name"].lower(), entry["name"])
        )

        return {
            "shortlist": scored[:shortlist_size],
            "total_applicants": len(applicants),
            "jd_skills_extracted": jd_skills,
        }

    def save_shortlist(
        self,
        db_session,
        jd_text: str,
        shortlist_size: int,
        result: Dict[str, Any],
    ) -> int:
        """Persist a shortlist row and return its new id."""
        row = Shortlist(
            jd_text=jd_text,
            shortlist_size=shortlist_size,
            results=result.get("shortlist", []),
        )
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        logger.info(
            "Saved shortlist id=%s with %d candidates.", row.id, len(row.results or [])
        )
        return row.id

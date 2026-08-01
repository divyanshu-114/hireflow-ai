"""HireFlow AI — Hiring Side Shortlist API Routes (Issue 22).

Endpoints:
- POST /hiring/shortlist      — accepts EITHER a JSON body
                                {jd_text, applicants, shortlist_size} OR
                                multipart/form-data (jd_text + shortlist_size
                                form fields + a CSV file upload with columns
                                ``name, skills``). The format is dispatched on
                                the Content-Type header, satisfying the
                                acceptance criterion "Accepts JD text and list
                                of applicants (JSON or CSV)" on one path.
- POST /hiring/shortlist/csv  — explicit multipart/form-data route using
                                idiomatic FastAPI ``Form(...)``/``File(...)``
                                parameters (same parsing + scoring logic).
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, ValidationError
from starlette.datastructures import UploadFile as StarletteUploadFile

from src.agents.hiring_shortlist_agent import HiringShortlistAgent
from src.config.database import SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hiring", tags=["hiring"])


# ------------------------------------------------------------------ #
# Request schemas
# ------------------------------------------------------------------ #


class ShortlistRequest(BaseModel):
    jd_text: str
    applicants: List[Dict[str, Any]]
    shortlist_size: int


# ------------------------------------------------------------------ #
# Shared validation + logic
# ------------------------------------------------------------------ #


def _validate_input(jd_text: str, shortlist_size: int) -> None:
    """Raise a 400 for invalid shortlist input."""
    if not jd_text or not jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text must not be empty.")
    if shortlist_size <= 0:
        raise HTTPException(
            status_code=400,
            detail="shortlist_size must be a positive integer.",
        )


def _run_shortlist(jd_text: str, applicants: List[Dict[str, Any]], shortlist_size: int):
    """Score, persist, and return the shortlist with its DB id."""
    agent = HiringShortlistAgent()
    result = agent.shortlist(jd_text, applicants, shortlist_size)

    db = SessionLocal()
    try:
        shortlist_id = agent.save_shortlist(db, jd_text, shortlist_size, result)
    finally:
        db.close()

    return {"shortlist_id": shortlist_id, **result}


def _parse_csv_bytes(raw: bytes) -> List[Dict[str, Any]]:
    """Parse raw CSV bytes (columns: name, skills) into applicant dicts.

    ``skills`` is a comma-separated string inside each cell, e.g.
    ``Alice,"Python, LangChain"``. Shared by the JSON-or-CSV main route and
    the explicit CSV route so the two paths can never diverge.
    """
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="CSV file must be UTF-8 encoded.",
        )

    reader = csv.DictReader(io.StringIO(content))
    fieldnames = reader.fieldnames or []
    if "name" not in fieldnames or "skills" not in fieldnames:
        raise HTTPException(
            status_code=400,
            detail="CSV must have columns 'name' and 'skills'.",
        )

    applicants: List[Dict[str, Any]] = []
    for row in reader:
        name = (row.get("name") or "").strip()
        skills_cell = row.get("skills") or ""
        skills = [s.strip() for s in skills_cell.split(",") if s.strip()]
        if not name:
            continue  # skip header/blank rows
        applicants.append({"name": name, "skills": skills})

    # Deliberate asymmetry with the JSON endpoint: an uploaded CSV with zero
    # valid rows is almost certainly a malformed upload (wrong columns, empty
    # file), so it fails loudly with a 400 rather than silently persisting an
    # empty shortlist like the JSON path would for an empty applicant list.
    if not applicants:
        raise HTTPException(
            status_code=400,
            detail="CSV contained no valid applicant rows (need 'name' and 'skills').",
        )

    return applicants


def _shortlist_from_csv_file(file: UploadFile, jd_text: str, shortlist_size: int):
    """Score applicants parsed from an uploaded CSV file."""
    raw = file.file.read()
    applicants = _parse_csv_bytes(raw)
    return _run_shortlist(jd_text, applicants, shortlist_size)


async def _shortlist_from_form(request: Request) -> Dict[str, Any]:
    """Handle a multipart/form-data (or urlencoded) request body."""
    form = await request.form()

    jd_text = form.get("jd_text")
    shortlist_size_raw = form.get("shortlist_size")
    file = form.get("file")

    if not isinstance(jd_text, str):
        raise HTTPException(status_code=400, detail="jd_text must not be empty.")

    try:
        shortlist_size = int(shortlist_size_raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail="shortlist_size must be a positive integer.",
        )
    _validate_input(jd_text, shortlist_size)

    # request.form() returns Starlette's UploadFile (not FastAPI's subclass,
    # which FastAPI only injects via File(...) params), so check against the
    # Starlette base class. FastAPI's UploadFile subclasses it, covering both.
    if not isinstance(file, StarletteUploadFile):
        raise HTTPException(
            status_code=400,
            detail="A CSV file upload is required (multipart field 'file').",
        )

    return _shortlist_from_csv_file(file, jd_text, shortlist_size)


# ------------------------------------------------------------------ #
# Endpoints
# ------------------------------------------------------------------ #


@router.post("/shortlist")
async def create_shortlist(request: Request) -> Dict[str, Any]:
    """Score applicants from a JSON body OR a multipart CSV upload.

    The accepted format is driven by the request's Content-Type header:
    ``multipart/form-data`` (or ``application/x-www-form-urlencoded``) is
    handled as the CSV upload path, anything else is parsed as JSON. This
    makes the single URL satisfy the "JSON or CSV" acceptance criterion and
    matches how real clients (e.g. curl ``-F``) post CSV uploads.
    """
    content_type = (request.headers.get("content-type") or "").lower()
    if content_type.startswith("multipart/form-data") or content_type.startswith(
        "application/x-www-form-urlencoded"
    ):
        return await _shortlist_from_form(request)

    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Request body must be valid JSON.")
    if not isinstance(body, dict):
        raise HTTPException(
            status_code=400, detail="Request body must be a JSON object."
        )

    try:
        payload = ShortlistRequest(**body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors())

    _validate_input(payload.jd_text, payload.shortlist_size)
    return _run_shortlist(payload.jd_text, payload.applicants, payload.shortlist_size)


@router.post("/shortlist/csv")
def create_shortlist_from_csv(
    jd_text: str = Form(...),
    shortlist_size: int = Form(...),
    file: UploadFile = File(...),
) -> Dict[str, Any]:
    """Score applicants parsed from an uploaded CSV (columns: name, skills).

    Explicit multipart route with idiomatic FastAPI ``Form(...)``/``File(...)``
    parameters. Shares the exact same parsing and scoring logic as the CSV
    branch of ``POST /hiring/shortlist``.
    """
    _validate_input(jd_text, shortlist_size)
    return _shortlist_from_csv_file(file, jd_text, shortlist_size)

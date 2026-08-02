from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime

from src.models import Base


class Shortlist(Base):
    """A persisted hiring shortlist: JD text + ranked candidate results.

    results is a JSONB list of dicts in the shape
    [{"name": str, "score": float, "matched_skills": [...], "skill_gaps": [...]}]
    since applicant data is ad-hoc and does not need its own relational table.
    """

    __tablename__ = "shortlists"

    id = Column(Integer, primary_key=True)
    jd_text = Column(String, nullable=False)
    shortlist_size = Column(Integer, nullable=True)
    results = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

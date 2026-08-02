"""add shortlists table

Revision ID: 4c5d6e7f8g9h
Revises: 3a698ed3dfbe
Create Date: 2026-08-01 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "4c5d6e7f8g9h"
down_revision: Union[str, None] = "3a698ed3dfbe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the shortlists table."""
    op.create_table(
        "shortlists",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("jd_text", sa.String(), nullable=False),
        sa.Column("shortlist_size", sa.Integer(), nullable=True),
        sa.Column(
            "results",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    """Drop the shortlists table."""
    op.drop_table("shortlists")

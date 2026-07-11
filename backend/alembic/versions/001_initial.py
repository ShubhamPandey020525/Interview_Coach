"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-07-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass  # Tables created via SQLAlchemy metadata on startup for v1


def downgrade() -> None:
    pass

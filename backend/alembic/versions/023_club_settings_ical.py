"""Add default_evening_time and ical_token to club_settings.extra

Revision ID: 023
Revises: 022
Create Date: 2026-03-17
"""
import uuid

from alembic import op
from sqlalchemy import text

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, extra FROM club_setting")).fetchall()
    for row in rows:
        import json
        extra = row.extra if row.extra else {}
        if isinstance(extra, str):
            extra = json.loads(extra)
        extra = dict(extra)
        if "default_evening_time" not in extra:
            extra["default_evening_time"] = "20:00"
        if "ical_token" not in extra:
            extra["ical_token"] = str(uuid.uuid4())
        conn.execute(
            text("UPDATE club_setting SET extra = :extra WHERE id = :id"),
            {"extra": json.dumps(extra), "id": row.id},
        )


def downgrade():
    pass

"""ScheduledEvening: merge date (String YYYY-MM-DD) + time (String HH:MM) into scheduled_at (TIMESTAMPTZ).

Existing rows get time defaulted to 20:00 UTC when time was NULL.

Revision ID: 026
Revises: 025
Create Date: 2026-03-17
"""
import sqlalchemy as sa
from alembic import op

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("scheduled_evening", sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE scheduled_evening
            SET scheduled_at = (
                date || ' ' || COALESCE(time, '20:00') || ':00'
            )::TIMESTAMPTZ
            """
        )
    )
    op.alter_column("scheduled_evening", "scheduled_at", nullable=False)
    op.drop_column("scheduled_evening", "date")
    op.drop_column("scheduled_evening", "time")


def downgrade():
    op.add_column("scheduled_evening", sa.Column("date", sa.String, nullable=True))
    op.add_column("scheduled_evening", sa.Column("time", sa.String, nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE scheduled_evening
            SET date = TO_CHAR(scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
                time = TO_CHAR(scheduled_at AT TIME ZONE 'UTC', 'HH24:MI')
            """
        )
    )
    op.alter_column("scheduled_evening", "date", nullable=False)
    op.drop_column("scheduled_evening", "scheduled_at")

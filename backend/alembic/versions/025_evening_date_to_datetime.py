"""Evening.date: migrate from String (YYYY-MM-DD) to TIMESTAMPTZ.

Existing rows are converted to 20:00 UTC on the stored date.

Revision ID: 025
Revises: 024
Create Date: 2026-03-17
"""
import sqlalchemy as sa
from alembic import op

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        sa.text(
            """
            ALTER TABLE evening
            ALTER COLUMN date TYPE TIMESTAMPTZ
            USING (date::date + INTERVAL '20 hours') AT TIME ZONE 'UTC'
            """
        )
    )


def downgrade():
    op.execute(
        sa.text(
            """
            ALTER TABLE evening
            ALTER COLUMN date TYPE VARCHAR
            USING TO_CHAR(date AT TIME ZONE 'UTC', 'YYYY-MM-DD')
            """
        )
    )

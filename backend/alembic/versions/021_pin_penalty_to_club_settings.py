"""Move pin penalty from club_pin to club_settings.extra

Revision ID: 021
Revises: 020
Create Date: 2026-03-17
"""
from alembic import op

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("club_pin", "penalty_amount")


def downgrade():
    import sqlalchemy as sa
    op.add_column("club_pin", sa.Column("penalty_amount", sa.Float(), nullable=False, server_default="1.0"))

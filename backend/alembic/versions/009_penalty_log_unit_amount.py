"""Add unit_amount to penalty_log for retroactive-safe count mode totals

Revision ID: 009
Revises: 008
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("penalty_log", sa.Column("unit_amount", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("penalty_log", "unit_amount")

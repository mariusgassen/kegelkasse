"""Add time column to scheduled_evening

Revision ID: 022
Revises: 021
Create Date: 2026-03-17
"""
import sqlalchemy as sa
from alembic import op

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("scheduled_evening", sa.Column("time", sa.String(), nullable=True))


def downgrade():
    op.drop_column("scheduled_evening", "time")

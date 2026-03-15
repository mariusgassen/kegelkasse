"""Add is_guest to regular_member

Revision ID: 007
Revises: 006
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("regular_member", sa.Column("is_guest", sa.Boolean, server_default="false", nullable=False))


def downgrade():
    op.drop_column("regular_member", "is_guest")

"""Add regular_member_id to user

Revision ID: 003
Revises: 002
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user",
        sa.Column("regular_member_id", sa.Integer, sa.ForeignKey("regular_member.id"), nullable=True)
    )


def downgrade():
    op.drop_column("user", "regular_member_id")

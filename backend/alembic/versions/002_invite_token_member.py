"""Add regular_member_id to invite_token

Revision ID: 002
Revises: 001
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("invite_token",
        sa.Column("regular_member_id", sa.Integer, sa.ForeignKey("regular_member.id"), nullable=True)
    )


def downgrade():
    op.drop_column("invite_token", "regular_member_id")

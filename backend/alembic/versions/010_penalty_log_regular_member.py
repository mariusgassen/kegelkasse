"""Add regular_member_id to penalty_log for absence penalty entries

Revision ID: 010
Revises: 009
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("penalty_log", sa.Column(
        "regular_member_id", sa.Integer(),
        sa.ForeignKey("regular_member.id"), nullable=True
    ))


def downgrade():
    op.drop_column("penalty_log", "regular_member_id")

"""Add member_payment table for tracking cash payments

Revision ID: 012
Revises: 011
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "member_payment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("club.id"), nullable=False),
        sa.Column("regular_member_id", sa.Integer(), sa.ForeignKey("regular_member.id"), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("member_payment")

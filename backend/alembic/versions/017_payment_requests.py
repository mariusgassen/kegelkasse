"""Add payment_request table for member-initiated payment tracking

Revision ID: 017
Revises: 016
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "payment_request",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("club.id"), nullable=False),
        sa.Column("regular_member_id", sa.Integer(), sa.ForeignKey("regular_member.id"), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("status", sa.Enum("pending", "confirmed", "rejected", name="paymentrequeststatus"),
                  nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
    )


def downgrade():
    op.drop_table("payment_request")
    op.execute("DROP TYPE IF EXISTS paymentrequeststatus")

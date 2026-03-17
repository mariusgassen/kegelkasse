"""Add scheduled_evening and member_rsvp tables for absence planning

Revision ID: 018
Revises: 017
Create Date: 2026-03-17
"""
from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scheduled_evening",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("club.id"), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("venue", sa.String(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("user.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scheduled_evening_id", "scheduled_evening", ["id"])
    op.create_index("ix_scheduled_evening_club_date", "scheduled_evening", ["club_id", "date"])

    op.create_table(
        "member_rsvp",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scheduled_evening_id", sa.Integer(),
                  sa.ForeignKey("scheduled_evening.id", ondelete="CASCADE"), nullable=False),
        sa.Column("regular_member_id", sa.Integer(), sa.ForeignKey("regular_member.id"), nullable=False),
        sa.Column("status", sa.String(), nullable=False),  # 'attending' | 'absent'
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scheduled_evening_id", "regular_member_id", name="uq_rsvp_member_evening"),
    )
    op.create_index("ix_member_rsvp_id", "member_rsvp", ["id"])


def downgrade():
    op.drop_table("member_rsvp")
    op.drop_table("scheduled_evening")

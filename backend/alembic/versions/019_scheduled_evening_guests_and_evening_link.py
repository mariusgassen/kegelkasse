"""Add scheduled_evening_guest table and link evening → scheduled_evening

Revision ID: 019
Revises: 018
Create Date: 2026-03-17
"""
from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade():
    # Guests planned ahead of a scheduled evening
    op.create_table(
        "scheduled_evening_guest",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "scheduled_evening_id",
            sa.Integer(),
            sa.ForeignKey("scheduled_evening.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "regular_member_id",
            sa.Integer(),
            sa.ForeignKey("regular_member.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scheduled_evening_guest_id", "scheduled_evening_guest", ["id"])
    op.create_index(
        "ix_scheduled_evening_guest_evening",
        "scheduled_evening_guest",
        ["scheduled_evening_id"],
    )

    # Link actual evening back to the scheduled evening it was started from
    op.add_column(
        "evening",
        sa.Column(
            "scheduled_evening_id",
            sa.Integer(),
            sa.ForeignKey("scheduled_evening.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("evening", "scheduled_evening_id")
    op.drop_index("ix_scheduled_evening_guest_evening", table_name="scheduled_evening_guest")
    op.drop_index("ix_scheduled_evening_guest_id", table_name="scheduled_evening_guest")
    op.drop_table("scheduled_evening_guest")

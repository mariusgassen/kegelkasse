"""Add is_president_game flag, club_president table, club_pin table

Revision ID: 020
Revises: 019
Create Date: 2026-03-17
"""
from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade():
    # Add president-game flag to game_template and game
    op.add_column("game_template", sa.Column("is_president_game", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("game", sa.Column("is_president_game", sa.Boolean(), nullable=False, server_default="false"))

    # Club president — one per club per year (upserted on finish_game)
    op.create_table(
        "club_president",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("club.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("regular_member_id", sa.Integer(), sa.ForeignKey("regular_member.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(), nullable=False),  # denormalized
        sa.Column("evening_id", sa.Integer(), sa.ForeignKey("evening.id", ondelete="SET NULL"), nullable=True),
        sa.Column("game_id", sa.Integer(), sa.ForeignKey("game.id", ondelete="SET NULL"), nullable=True),
        sa.Column("determined_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("club_id", "year", name="uq_club_president_year"),
    )
    op.create_index("ix_club_president_club_year", "club_president", ["club_id", "year"])

    # Club pins — physical items a member holds and must bring to each evening
    op.create_table(
        "club_pin",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("club.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("icon", sa.String(), nullable=False, server_default="📌"),
        sa.Column("penalty_amount", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column(
            "holder_regular_member_id",
            sa.Integer(),
            sa.ForeignKey("regular_member.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("holder_name", sa.String(), nullable=True),  # denormalized
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_club_pin_club", "club_pin", ["club_id"])


def downgrade():
    op.drop_index("ix_club_pin_club", table_name="club_pin")
    op.drop_table("club_pin")
    op.drop_index("ix_club_president_club_year", table_name="club_president")
    op.drop_table("club_president")
    op.drop_column("game", "is_president_game")
    op.drop_column("game_template", "is_president_game")

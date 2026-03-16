"""Add game status/timestamps, penalty_log.game_id, evening_player.is_king

Revision ID: 011
Revises: 010
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("game", sa.Column("status", sa.String(), nullable=False, server_default="open"))
    op.add_column("game", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("game", sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("penalty_log", sa.Column(
        "game_id", sa.Integer(), sa.ForeignKey("game.id"), nullable=True
    ))
    op.add_column("evening_player", sa.Column("is_king", sa.Boolean(), nullable=False, server_default="false"))


def downgrade():
    op.drop_column("evening_player", "is_king")
    op.drop_column("penalty_log", "game_id")
    op.drop_column("game", "finished_at")
    op.drop_column("game", "started_at")
    op.drop_column("game", "status")

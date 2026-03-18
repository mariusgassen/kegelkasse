"""penalty_log.game_id FK: change to ON DELETE SET NULL so deleting a game row doesn't violate FK.

Revision ID: 027
Revises: 026
Create Date: 2026-03-18
"""
import sqlalchemy as sa
from alembic import op

revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade():
    # Drop old FK constraint and recreate with ON DELETE SET NULL
    op.drop_constraint("penalty_log_game_id_fkey", "penalty_log", type_="foreignkey")
    op.create_foreign_key(
        "penalty_log_game_id_fkey",
        "penalty_log", "game",
        ["game_id"], ["id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("penalty_log_game_id_fkey", "penalty_log", type_="foreignkey")
    op.create_foreign_key(
        "penalty_log_game_id_fkey",
        "penalty_log", "game",
        ["game_id"], ["id"],
    )

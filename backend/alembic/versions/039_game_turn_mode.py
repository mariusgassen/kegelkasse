"""Add turn_mode to game; migrate winner_type 'either' → 'individual'."""
from alembic import op
import sqlalchemy as sa

revision = '039'
down_revision = '038'
branch_labels = None
depends_on = None


def upgrade():
    # Add turn_mode column to game (alternating | block | null for individual games)
    op.add_column('game', sa.Column('turn_mode', sa.String(20), nullable=True))

    # Migrate winner_type 'either' → 'individual' in both tables
    op.execute("UPDATE game SET winner_type = 'individual' WHERE winner_type = 'either'")
    op.execute("UPDATE game_template SET winner_type = 'individual' WHERE winner_type = 'either'")


def downgrade():
    op.drop_column('game', 'turn_mode')

"""Add turn_mode to game_template."""
from alembic import op
import sqlalchemy as sa

revision = '040'
down_revision = '039'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('game_template', sa.Column('turn_mode', sa.String(20), nullable=True))


def downgrade():
    op.drop_column('game_template', 'turn_mode')

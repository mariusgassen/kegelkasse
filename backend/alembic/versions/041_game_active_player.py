"""Add active_player_id to game for kiosk/tablet sync."""
from alembic import op
import sqlalchemy as sa

revision = '041'
down_revision = '040'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('game', sa.Column('active_player_id', sa.Integer(), sa.ForeignKey('evening_player.id', ondelete='SET NULL'), nullable=True))


def downgrade():
    op.drop_column('game', 'active_player_id')

"""Add player_id to game_throw_log for turn-order tracking."""
from alembic import op
import sqlalchemy as sa

revision = '038'
down_revision = '037'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('game_throw_log',
        sa.Column('player_id', sa.Integer(),
                  sa.ForeignKey('evening_player.id', ondelete='SET NULL'),
                  nullable=True))
    op.create_index('ix_game_throw_log_player', 'game_throw_log', ['player_id'])


def downgrade():
    op.drop_index('ix_game_throw_log_player', table_name='game_throw_log')
    op.drop_column('game_throw_log', 'player_id')

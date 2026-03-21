"""Add game_throw_log table for camera-detected throws."""
from alembic import op
import sqlalchemy as sa

revision = '037'
down_revision = '036'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'game_throw_log',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('game_id', sa.Integer(), sa.ForeignKey('game.id', ondelete='CASCADE'), nullable=False),
        sa.Column('throw_num', sa.Integer(), nullable=False),
        sa.Column('pins', sa.Integer(), nullable=False),
        sa.Column('cumulative', sa.Integer(), nullable=True),
        sa.Column('pin_states', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_game_throw_log_game', 'game_throw_log', ['game_id'])


def downgrade():
    op.drop_index('ix_game_throw_log_game', table_name='game_throw_log')
    op.drop_table('game_throw_log')

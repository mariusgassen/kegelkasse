"""Add club_poll, poll_option, poll_vote tables.

Revision ID: 045
Revises: 044
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = '045'
down_revision = '044'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'club_poll',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('mode', sa.String(), nullable=False, server_default='single'),  # 'single' | 'multi'
        sa.Column('is_closed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_club_poll_club_id', 'club_poll', ['club_id'])

    op.create_table(
        'poll_option',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('poll_id', sa.Integer(), sa.ForeignKey('club_poll.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.String(), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_poll_option_poll_id', 'poll_option', ['poll_id'])

    op.create_table(
        'poll_vote',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('poll_id', sa.Integer(), sa.ForeignKey('club_poll.id', ondelete='CASCADE'), nullable=False),
        sa.Column('option_id', sa.Integer(), sa.ForeignKey('poll_option.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('poll_id', 'option_id', 'user_id', name='uq_poll_vote'),
    )
    op.create_index('ix_poll_vote_poll_id', 'poll_vote', ['poll_id'])


def downgrade():
    op.drop_index('ix_poll_vote_poll_id', table_name='poll_vote')
    op.drop_table('poll_vote')
    op.drop_index('ix_poll_option_poll_id', table_name='poll_option')
    op.drop_table('poll_option')
    op.drop_index('ix_club_poll_club_id', table_name='club_poll')
    op.drop_table('club_poll')

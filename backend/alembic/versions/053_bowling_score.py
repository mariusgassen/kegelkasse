"""Add bowling_score table (club-wide mini-game leaderboard).

Revision ID: 053
Revises: 052
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa

revision = '053'
down_revision = '052'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'bowling_score',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('regular_member_id', sa.Integer(), sa.ForeignKey('regular_member.id', ondelete='SET NULL'), nullable=True),
        sa.Column('player_name', sa.String(), nullable=False),
        sa.Column('score', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_bowling_score_club_id', 'bowling_score', ['club_id'])
    op.create_index('ix_bowling_score_club_score', 'bowling_score', ['club_id', 'score'])


def downgrade():
    op.drop_index('ix_bowling_score_club_score', table_name='bowling_score')
    op.drop_index('ix_bowling_score_club_id', table_name='bowling_score')
    op.drop_table('bowling_score')

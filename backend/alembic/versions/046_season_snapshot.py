"""Add season_snapshot table.

Revision ID: 046
Revises: 045
Create Date: 2026-04-08
"""
from alembic import op
import sqlalchemy as sa

revision = '046'
down_revision = '045'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'season_snapshot',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('closed_by_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('ranking_data', sa.JSON(), nullable=True),
        sa.Column('member_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('evening_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('carry_over_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_penalties', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_payments', sa.Float(), nullable=False, server_default='0'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.UniqueConstraint('club_id', 'year', name='uq_season_snapshot_club_year'),
    )
    op.create_index('ix_season_snapshot_club_id', 'season_snapshot', ['club_id'])


def downgrade():
    op.drop_index('ix_season_snapshot_club_id', table_name='season_snapshot')
    op.drop_table('season_snapshot')

"""Create club_announcement table

Revision ID: 033
Revises: 032
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = '033'
down_revision = '032'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'club_announcement',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.create_index('ix_club_announcement_club_id', 'club_announcement', ['club_id'])


def downgrade():
    op.drop_index('ix_club_announcement_club_id', table_name='club_announcement')
    op.drop_table('club_announcement')

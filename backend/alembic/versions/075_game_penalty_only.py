"""Penalty-only flag on game templates and games.

A penalty-only game has no winner/loser; the finish dialog opens in penalty-only mode.

Revision ID: 075
Revises: 074
Create Date: 2026-11-15
"""
from alembic import op
import sqlalchemy as sa

revision = '075'
down_revision = '074'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('game_template', 'game'):
        op.add_column(table, sa.Column('penalty_only', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    for table in ('game', 'game_template'):
        op.drop_column(table, 'penalty_only')

"""Manual-penalties flag on game templates and games.

A manual-penalties game still has a winner, but its penalties are set by hand per player
instead of being calculated from the loser/per-point amounts.

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
        op.add_column(table, sa.Column('manual_penalties', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    for table in ('game', 'game_template'):
        op.drop_column(table, 'manual_penalties')

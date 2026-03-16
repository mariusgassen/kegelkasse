"""add per_point_penalty to game_template

Revision ID: 014
Revises: 013
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = '014'
down_revision = '013'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('game_template', sa.Column('per_point_penalty', sa.Float(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('game_template', 'per_point_penalty')

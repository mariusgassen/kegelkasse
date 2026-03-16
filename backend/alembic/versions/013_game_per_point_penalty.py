"""add per_point_penalty to game

Revision ID: 013
Revises: 012
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('game', sa.Column('per_point_penalty', sa.Float(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('game', 'per_point_penalty')

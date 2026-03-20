"""Add is_committee flag to regular_member

Revision ID: 032
Revises: 031
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = '032'
down_revision = '031'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('regular_member', sa.Column('is_committee', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('regular_member', 'is_committee')

"""add is_deleted to scheduled_evening

Revision ID: 029
Revises: 028
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = '029'
down_revision = '028'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('scheduled_evening', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('scheduled_evening', 'is_deleted')

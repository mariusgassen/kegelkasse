"""Add is_read to notification_log

Revision ID: 036
Revises: 035
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = '036'
down_revision = '035'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('notification_log', sa.Column('is_read', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('notification_log', 'is_read')

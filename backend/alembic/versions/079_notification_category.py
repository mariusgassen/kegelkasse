"""Notification log: store notification category for selective read marking.
Revision ID: 079
Revises: 078
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa

revision = '079'
down_revision = '078'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('notification_log', sa.Column('category', sa.String(length=64), nullable=True))


def downgrade():
    op.drop_column('notification_log', 'category')

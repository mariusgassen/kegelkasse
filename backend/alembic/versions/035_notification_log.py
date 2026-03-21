"""Add notification_log table for hybrid server-side notification history

Revision ID: 035
Revises: 034
Create Date: 2026-03-21
"""
from alembic import op
import sqlalchemy as sa

revision = '035'
down_revision = '034'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'notification_log',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False, server_default=''),
        sa.Column('url', sa.Text(), nullable=False, server_default='/'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_notification_log_user_id', 'notification_log', ['user_id'])


def downgrade():
    op.drop_index('ix_notification_log_user_id', table_name='notification_log')
    op.drop_table('notification_log')

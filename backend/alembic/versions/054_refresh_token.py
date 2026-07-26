"""Add refresh_token table (rotating refresh-token sessions).

Revision ID: 054
Revises: 053
Create Date: 2026-07-26
"""
from alembic import op
import sqlalchemy as sa

revision = '054'
down_revision = '053'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'refresh_token',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('family_id', sa.String(length=36), nullable=False),
        sa.Column('user_agent', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('rotated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_refresh_token_user_id', 'refresh_token', ['user_id'])
    op.create_index('ix_refresh_token_token_hash', 'refresh_token', ['token_hash'], unique=True)
    op.create_index('ix_refresh_token_family_id', 'refresh_token', ['family_id'])
    op.create_index('ix_refresh_token_expires_at', 'refresh_token', ['expires_at'])


def downgrade():
    op.drop_index('ix_refresh_token_expires_at', table_name='refresh_token')
    op.drop_index('ix_refresh_token_family_id', table_name='refresh_token')
    op.drop_index('ix_refresh_token_token_hash', table_name='refresh_token')
    op.drop_index('ix_refresh_token_user_id', table_name='refresh_token')
    op.drop_table('refresh_token')

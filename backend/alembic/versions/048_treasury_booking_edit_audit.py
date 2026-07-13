"""Add edit audit columns (updated_at, updated_by) to treasury booking tables.

Revision ID: 048
Revises: 047
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = '048'
down_revision = '047'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('member_payment', 'club_expense'):
        op.add_column(table, sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column('updated_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True))


def downgrade():
    for table in ('member_payment', 'club_expense'):
        op.drop_column(table, 'updated_by')
        op.drop_column(table, 'updated_at')

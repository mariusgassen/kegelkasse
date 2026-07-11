"""Add audit trail, idempotency keys, and transfer grouping to treasury tables.

Revision ID: 047
Revises: 046
Create Date: 2026-07-11
"""
from alembic import op
import sqlalchemy as sa

revision = '047'
down_revision = '046'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('member_payment', 'club_expense'):
        op.add_column(table, sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'))
        op.add_column(table, sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
        op.add_column(table, sa.Column('deleted_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True))
        op.add_column(table, sa.Column('delete_reason', sa.String(), nullable=True))
        op.add_column(table, sa.Column('idempotency_key', sa.String(), nullable=True))
        op.create_index(f'ix_{table}_idempotency_key', table, ['idempotency_key'], unique=True)

    op.add_column('member_payment', sa.Column('transfer_group_id', sa.String(), nullable=True))
    op.create_index('ix_member_payment_transfer_group_id', 'member_payment', ['transfer_group_id'])


def downgrade():
    op.drop_index('ix_member_payment_transfer_group_id', table_name='member_payment')
    op.drop_column('member_payment', 'transfer_group_id')

    for table in ('member_payment', 'club_expense'):
        op.drop_index(f'ix_{table}_idempotency_key', table_name=table)
        op.drop_column(table, 'idempotency_key')
        op.drop_column(table, 'delete_reason')
        op.drop_column(table, 'deleted_by')
        op.drop_column(table, 'deleted_at')
        op.drop_column(table, 'is_deleted')

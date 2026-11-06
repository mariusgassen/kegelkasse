"""Zeugwart: is_zeugwart flag on regular_member, inventory_item + inventory_movement tables."""
from alembic import op
import sqlalchemy as sa

revision = '069'
down_revision = '068'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('regular_member', sa.Column('is_zeugwart', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        'inventory_item',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('icon', sa.String(), nullable=True),
        sa.Column('stock', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('target', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_inventory_item_id', 'inventory_item', ['id'])
    op.create_index('ix_inventory_item_club_id', 'inventory_item', ['club_id'])
    op.create_table(
        'inventory_movement',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('item_id', sa.Integer(), sa.ForeignKey('inventory_item.id', ondelete='CASCADE'), nullable=False),
        sa.Column('delta', sa.Integer(), nullable=False),
        sa.Column('stock_after', sa.Integer(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('actor_name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_inventory_movement_id', 'inventory_movement', ['id'])
    op.create_index('ix_inventory_movement_item_id', 'inventory_movement', ['item_id'])


def downgrade():
    op.drop_table('inventory_movement')
    op.drop_table('inventory_item')
    op.drop_column('regular_member', 'is_zeugwart')

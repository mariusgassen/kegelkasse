"""Roadmap refinements (tags, pin, duplicates, notes) and user multiple roles.

Revision ID: 073
Revises: 072
Create Date: 2026-11-11
"""
from alembic import op
import sqlalchemy as sa

revision = '073'
down_revision = '072'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # 1. Ensure 'product_manager' value is in postgres userrole enum if postgresql
    if bind.dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'product_manager'")

    # 2. Add new columns to roadmap_item
    op.add_column('roadmap_item', sa.Column('tags', sa.String(length=200), nullable=True))
    op.add_column('roadmap_item', sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('roadmap_item', sa.Column('duplicate_of_id', sa.Integer(), sa.ForeignKey('roadmap_item.id', ondelete='SET NULL'), nullable=True))
    op.add_column('roadmap_item', sa.Column('admin_notes', sa.Text(), nullable=True))

    op.create_index('ix_roadmap_item_category', 'roadmap_item', ['category'])
    op.create_index('ix_roadmap_item_is_pinned', 'roadmap_item', ['is_pinned'])
    op.create_index('ix_roadmap_item_duplicate_of_id', 'roadmap_item', ['duplicate_of_id'])

    # 3. Add roles JSON column to user
    op.add_column('user', sa.Column('roles', sa.JSON(), nullable=True))

    # 4. Backfill user roles from existing role column
    user_table = sa.table(
        'user',
        sa.column('id', sa.Integer),
        sa.column('role', sa.String),
        sa.column('roles', sa.JSON),
    )
    rows = bind.execute(sa.select(user_table.c.id, user_table.c.role)).fetchall()
    for row in rows:
        initial_roles = [str(row.role)] if row.role else ["member"]
        bind.execute(
            user_table.update().where(user_table.c.id == row.id).values(roles=initial_roles)
        )

    # 5. Clean up any "2.0" references from initial roadmap seed
    roadmap_table = sa.table(
        'roadmap_item',
        sa.column('id', sa.Integer),
        sa.column('title', sa.String),
        sa.column('tags', sa.String),
        sa.column('is_pinned', sa.Boolean),
        sa.column('target_version', sa.String),
    )
    bind.execute(
        roadmap_table.update().where(roadmap_table.c.target_version == '2.0').values(target_version=None)
    )
    bind.execute(
        roadmap_table.update().where(roadmap_table.c.title == "In-App Community-Roadmap & Feedback").values(
            is_pinned=True,
            tags="community, feedback, voting"
        )
    )


def downgrade():
    op.drop_column('user', 'roles')
    op.drop_index('ix_roadmap_item_duplicate_of_id', table_name='roadmap_item')
    op.drop_index('ix_roadmap_item_is_pinned', table_name='roadmap_item')
    op.drop_index('ix_roadmap_item_category', table_name='roadmap_item')
    op.drop_column('roadmap_item', 'admin_notes')
    op.drop_column('roadmap_item', 'duplicate_of_id')
    op.drop_column('roadmap_item', 'is_pinned')
    op.drop_column('roadmap_item', 'tags')

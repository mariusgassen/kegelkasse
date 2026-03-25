"""Add comment replies (parent_comment_id), edited_at, and item_reaction table.

Revision ID: 044
Revises: 043
Create Date: 2026-03-25
"""
from alembic import op
import sqlalchemy as sa

revision = '044'
down_revision = '043'
branch_labels = None
depends_on = None


def upgrade():
    # Add reply support to comment (nullable FK to parent comment)
    op.add_column('comment', sa.Column('parent_comment_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_comment_parent',
        'comment', 'comment',
        ['parent_comment_id'], ['id'],
        ondelete='CASCADE',
    )

    # Track comment edits
    op.add_column('comment', sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))

    # Reactions on highlight/announcement items themselves (not on comments)
    op.create_table(
        'item_reaction',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('parent_type', sa.String(20), nullable=False),  # 'highlight' | 'announcement'
        sa.Column('parent_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('emoji', sa.String(10), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('parent_type', 'parent_id', 'user_id', 'emoji', name='uq_item_reaction'),
    )


def downgrade():
    op.drop_table('item_reaction')
    op.drop_column('comment', 'edited_at')
    op.drop_constraint('fk_comment_parent', 'comment', type_='foreignkey')
    op.drop_column('comment', 'parent_comment_id')

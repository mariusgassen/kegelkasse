"""Add comment and comment_reaction tables for highlights and announcements."""
import sqlalchemy as sa
from alembic import op

revision = '042'
down_revision = '041'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'comment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('parent_type', sa.String(20), nullable=False),  # 'highlight' or 'announcement'
        sa.Column('parent_id', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.create_index('ix_comment_parent', 'comment', ['parent_type', 'parent_id'])

    op.create_table(
        'comment_reaction',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('comment_id', sa.Integer(), sa.ForeignKey('comment.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('emoji', sa.String(10), nullable=False),
        sa.UniqueConstraint('comment_id', 'user_id', 'emoji', name='uq_comment_reaction'),
    )


def downgrade():
    op.drop_table('comment_reaction')
    op.drop_index('ix_comment_parent', 'comment')
    op.drop_table('comment')

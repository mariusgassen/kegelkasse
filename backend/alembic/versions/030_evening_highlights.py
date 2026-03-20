"""Add evening_highlight table."""
from alembic import op
import sqlalchemy as sa

revision = '030'
down_revision = '029'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'evening_highlight',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('evening_id', sa.Integer(), sa.ForeignKey('evening.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.String(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_evening_highlight_evening', 'evening_highlight', ['evening_id'])


def downgrade():
    op.drop_index('ix_evening_highlight_evening', table_name='evening_highlight')
    op.drop_table('evening_highlight')

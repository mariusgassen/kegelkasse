"""add club_expense table

Revision ID: 016
Revises: 015
Create Date: 2026-03-16
"""
from alembic import op
import sqlalchemy as sa

revision = '016'
down_revision = '015'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'club_expense',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id'), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_club_expense_id', 'club_expense', ['id'])
    op.create_index('ix_club_expense_club_id', 'club_expense', ['club_id'])


def downgrade():
    op.drop_index('ix_club_expense_club_id', table_name='club_expense')
    op.drop_index('ix_club_expense_id', table_name='club_expense')
    op.drop_table('club_expense')

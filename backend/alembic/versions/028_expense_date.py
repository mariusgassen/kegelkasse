"""add date column to club_expense

Revision ID: 028
Revises: 027
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = '028'
down_revision = '027'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('club_expense', sa.Column('date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('club_expense', 'date')

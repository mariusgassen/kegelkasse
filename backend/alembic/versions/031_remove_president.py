"""Remove club_president table

Revision ID: 031
Revises: 030
Create Date: 2026-03-20
"""
from alembic import op

revision = '031'
down_revision = '030'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table('club_president')


def downgrade():
    pass  # Not restoring the president table

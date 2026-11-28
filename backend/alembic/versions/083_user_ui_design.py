"""Per-member choice between the classic and the new look.

Revision ID: 083
Revises: 082
Create Date: 2026-11-28
"""
from alembic import op
import sqlalchemy as sa

revision = '083'
down_revision = '082'
branch_labels = None
depends_on = None


def upgrade():
    # NULL means classic, so nobody's app changes without them choosing it
    op.add_column('user', sa.Column('ui_design', sa.String(), nullable=True))


def downgrade():
    op.drop_column('user', 'ui_design')

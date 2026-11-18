"""Club documents: summary and change summary per version.
Revision ID: 077
Revises: 076
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa

revision = '077'
down_revision = '076'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('club_document', sa.Column('summary', sa.Text(), nullable=True))
    op.add_column('club_document', sa.Column('change_summary', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('club_document', 'change_summary')
    op.drop_column('club_document', 'summary')

"""News feed: last-change timestamp on announcements, trips and polls.
Revision ID: 078
Revises: 077
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa

revision = '078'
down_revision = '077'
branch_labels = None
depends_on = None

TABLES = ('club_announcement', 'club_trip', 'club_poll')


def upgrade():
    for table in TABLES:
        op.add_column(table, sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    for table in TABLES:
        op.drop_column(table, 'updated_at')

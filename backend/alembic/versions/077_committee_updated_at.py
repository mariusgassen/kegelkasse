"""News feed: last-change timestamp on announcements, trips and polls.
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

TABLES = ('club_announcement', 'club_trip', 'club_poll')


def upgrade():
    for table in TABLES:
        op.add_column(table, sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    for table in TABLES:
        op.drop_column(table, 'updated_at')

"""Per-user iCal feed token.

The calendar feed used to be one shared club-wide secret, which meant it could not know who was
subscribing. A per-user token lets the feed show each member their own RSVP state and lets a single
leaked link be rotated without breaking everyone else's subscription. Tokens are created lazily on
first request, so existing users need no backfill; the club-wide token keeps working unpersonalized.
"""
from alembic import op
import sqlalchemy as sa

revision = '061'
down_revision = '060'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('ical_token', sa.String(), nullable=True))
    op.create_index('ix_user_ical_token', 'user', ['ical_token'], unique=True)


def downgrade():
    op.drop_index('ix_user_ical_token', table_name='user')
    op.drop_column('user', 'ical_token')

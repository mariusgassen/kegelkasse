"""Regular member deactivation: a lighter, reversible "left the club" marker.

Distinct from the existing guest-conversion removal (#44) and from
``RegularMember.is_active`` (which also gates visibility in the treasury
balance endpoints — flipping that off would hide a departing member's
still-open balance before it's settled). ``deactivated_at`` only excludes the
member from future-evening logic (absence penalties, RSVP prompts/reminders);
their historical data and treasury balance stay untouched until an admin
completes the separate removal flow.
"""
from alembic import op
import sqlalchemy as sa

revision = '059'
down_revision = '058'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('regular_member', sa.Column('deactivated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('regular_member', 'deactivated_at')

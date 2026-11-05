"""Link a club expense to the Kegelfahrt it paid for."""
from alembic import op
import sqlalchemy as sa

revision = '065'
down_revision = '064'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('club_expense', sa.Column(
        'trip_id', sa.Integer(), sa.ForeignKey('club_trip.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_club_expense_trip_id', 'club_expense', ['trip_id'])


def downgrade():
    op.drop_index('ix_club_expense_trip_id', table_name='club_expense')
    op.drop_column('club_expense', 'trip_id')

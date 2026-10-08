"""Optional end date on club trips, so a Kegelfahrt can span several days."""
from alembic import op
import sqlalchemy as sa

revision = '062'
down_revision = '061'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('club_trip', sa.Column('end_date', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('club_trip', 'end_date')

"""Add date column to member_payment — backdating, same as club_expense."""
from alembic import op
import sqlalchemy as sa

revision = '050'
down_revision = '049'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('member_payment', sa.Column('date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('member_payment', 'date')

"""Link a member deposit to the club expense it covers (transfer_group_id on club_expense)."""
from alembic import op
import sqlalchemy as sa

revision = '063'
down_revision = '062'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('club_expense', sa.Column('transfer_group_id', sa.String(), nullable=True))
    op.create_index('ix_club_expense_transfer_group_id', 'club_expense', ['transfer_group_id'])


def downgrade():
    op.drop_index('ix_club_expense_transfer_group_id', table_name='club_expense')
    op.drop_column('club_expense', 'transfer_group_id')

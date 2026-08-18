"""Drop penalty_type.sort_order — penalty types now sort by price, then name.

The column was never editable in the UI (create hardcoded 99), so in practice it held one of two
values and left the quick-entry grid in effectively arbitrary order. The tablet view already grouped
by amount; ordering by (default_amount, name) everywhere makes the two views agree without a field
nobody maintains.
"""
from alembic import op
import sqlalchemy as sa

revision = '056'
down_revision = '055'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('penalty_type', 'sort_order')


def downgrade():
    op.add_column('penalty_type', sa.Column('sort_order', sa.Integer(), nullable=True, server_default='0'))

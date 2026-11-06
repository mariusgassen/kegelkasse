"""Keep the original base64 avatar while it is moved to object storage."""
from alembic import op
import sqlalchemy as sa

revision = '067'
down_revision = '066'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('avatar_legacy', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('user', 'avatar_legacy')

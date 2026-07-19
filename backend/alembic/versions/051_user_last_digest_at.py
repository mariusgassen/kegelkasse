"""Add last_digest_at to user — tracks when the personalized email digest was last sent."""
from alembic import op
import sqlalchemy as sa

revision = '051'
down_revision = '050'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('last_digest_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('user', 'last_digest_at')

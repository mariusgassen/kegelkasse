"""Add ended_at to evening — records the evening's actual close timestamp."""
from alembic import op
import sqlalchemy as sa

revision = '049'
down_revision = '048'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('evening', sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('evening', 'ended_at')

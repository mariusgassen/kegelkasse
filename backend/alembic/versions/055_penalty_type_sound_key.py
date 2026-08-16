"""Add sound_key to penalty_type — optional audio call-out preset played when the penalty is logged."""
from alembic import op
import sqlalchemy as sa

revision = '055'
down_revision = '054'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('penalty_type', sa.Column('sound_key', sa.String(), nullable=True))


def downgrade():
    op.drop_column('penalty_type', 'sound_key')

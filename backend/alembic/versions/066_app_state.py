"""Instance-wide key/value state (last announced release version)."""
from alembic import op
import sqlalchemy as sa

revision = '066'
down_revision = '065'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'app_state',
        sa.Column('key', sa.Text(), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('app_state')

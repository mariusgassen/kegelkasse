"""Sticker wall: several photos per sticker."""
from alembic import op
import sqlalchemy as sa

revision = '070'
down_revision = '069'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('sticker', sa.Column('extra_media', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('sticker', 'extra_media')

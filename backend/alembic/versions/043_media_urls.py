"""Add media_url to evening_highlight, club_announcement, and comment tables."""
import sqlalchemy as sa
from alembic import op

revision = '043'
down_revision = '042'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('evening_highlight', sa.Column('media_url', sa.String(), nullable=True))
    op.add_column('club_announcement', sa.Column('media_url', sa.String(), nullable=True))
    op.add_column('comment', sa.Column('media_url', sa.String(), nullable=True))
    # Allow highlight text to be empty when an image is provided
    op.alter_column('evening_highlight', 'text', nullable=True)
    # Allow comment text to be empty when an image is provided
    op.alter_column('comment', 'text', nullable=True)


def downgrade():
    op.alter_column('comment', 'text', nullable=False)
    op.alter_column('evening_highlight', 'text', nullable=False)
    op.drop_column('comment', 'media_url')
    op.drop_column('club_announcement', 'media_url')
    op.drop_column('evening_highlight', 'media_url')

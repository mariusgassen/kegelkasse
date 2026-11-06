"""Sticker wall: club stickers with photo and location."""
from alembic import op
import sqlalchemy as sa

revision = '068'
down_revision = '067'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sticker',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('media_url', sa.String(), nullable=False),
        sa.Column('place_name', sa.String(), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('caption', sa.Text(), nullable=True),
        sa.Column('stuck_on', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_sticker_id', 'sticker', ['id'])
    op.create_index('ix_sticker_club_created', 'sticker', ['club_id', 'created_at'])


def downgrade():
    op.drop_index('ix_sticker_club_created', table_name='sticker')
    op.drop_index('ix_sticker_id', table_name='sticker')
    op.drop_table('sticker')

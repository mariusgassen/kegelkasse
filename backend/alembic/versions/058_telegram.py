"""Telegram notification channel: user chat_id link + one-time link codes.

The bot token / webhook secret live in ``ClubSettings.extra["telegram"]``
(same no-migration pattern as email/reminders settings) — no schema change
needed for those.
"""
from alembic import op
import sqlalchemy as sa

revision = '058'
down_revision = '057'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('telegram_chat_id', sa.String(), nullable=True))

    op.create_table(
        'telegram_link_code',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_telegram_link_code_code', 'telegram_link_code', ['code'], unique=True)
    op.create_index('ix_telegram_link_code_user_id', 'telegram_link_code', ['user_id'])


def downgrade():
    op.drop_index('ix_telegram_link_code_user_id', table_name='telegram_link_code')
    op.drop_index('ix_telegram_link_code_code', table_name='telegram_link_code')
    op.drop_table('telegram_link_code')
    op.drop_column('user', 'telegram_chat_id')

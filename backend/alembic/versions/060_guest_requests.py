"""Guest requests: interested people ask to join a scheduled evening as a guest.

Requests arrive through the public API (club website / Instagram link), are approved or
rejected by any club member, and on approval become a ``scheduled_evening_guest``.
``scheduled_evening.guest_requests_enabled`` lets admins switch the request link off for a
single evening (default on).
"""
from alembic import op
import sqlalchemy as sa

revision = '060'
down_revision = '059'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('scheduled_evening', sa.Column('guest_requests_enabled', sa.Boolean(), nullable=False,
                                                 server_default=sa.true()))
    op.create_table(
        'guest_request',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('scheduled_evening_id', sa.Integer(),
                  sa.ForeignKey('scheduled_evening.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('guest_id', sa.Integer(),
                  sa.ForeignKey('scheduled_evening_guest.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_guest_request_club_status', 'guest_request', ['club_id', 'status'])


def downgrade():
    op.drop_index('ix_guest_request_club_status', table_name='guest_request')
    op.drop_table('guest_request')
    op.drop_column('scheduled_evening', 'guest_requests_enabled')

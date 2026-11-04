"""Kegelfahrt-Kasse: trip participants and a shared expense ledger per trip."""
from alembic import op
import sqlalchemy as sa

revision = '065'
down_revision = '064'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'trip_participant',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('club_trip.id', ondelete='CASCADE'), nullable=False),
        sa.Column('regular_member_id', sa.Integer(), sa.ForeignKey('regular_member.id', ondelete='CASCADE'),
                  nullable=False),
        sa.UniqueConstraint('trip_id', 'regular_member_id', name='uq_trip_participant'),
    )
    op.create_index('ix_trip_participant_trip_id', 'trip_participant', ['trip_id'])
    op.create_table(
        'trip_expense',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('trip_id', sa.Integer(), sa.ForeignKey('club_trip.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(), nullable=False, server_default='expense'),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('paid_by_member_id', sa.Integer(), sa.ForeignKey('regular_member.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('to_member_id', sa.Integer(), sa.ForeignKey('regular_member.id', ondelete='CASCADE'),
                  nullable=True),
        sa.Column('split_member_ids', sa.JSON(), nullable=True),
        sa.Column('date', sa.Date(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_trip_expense_trip_id', 'trip_expense', ['trip_id'])


def downgrade():
    op.drop_index('ix_trip_expense_trip_id', table_name='trip_expense')
    op.drop_table('trip_expense')
    op.drop_index('ix_trip_participant_trip_id', table_name='trip_participant')
    op.drop_table('trip_participant')

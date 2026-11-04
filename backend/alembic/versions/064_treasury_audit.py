"""Kassenprüfung: auditor flag on regular_member, treasury_audit + treasury_audit_signature tables."""
from alembic import op
import sqlalchemy as sa

revision = '064'
down_revision = '063'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('regular_member', sa.Column('is_auditor', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        'treasury_audit',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('snapshot', sa.JSON(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_treasury_audit_id', 'treasury_audit', ['id'])
    op.create_index('ix_treasury_audit_club_id', 'treasury_audit', ['club_id'])
    op.create_table(
        'treasury_audit_signature',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('audit_id', sa.Integer(), sa.ForeignKey('treasury_audit.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('signer_name', sa.String(), nullable=False),
        sa.Column('approved', sa.Boolean(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('signed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('audit_id', 'user_id', name='uq_treasury_audit_signature_user'),
    )
    op.create_index('ix_treasury_audit_signature_id', 'treasury_audit_signature', ['id'])
    op.create_index('ix_treasury_audit_signature_audit_id', 'treasury_audit_signature', ['audit_id'])


def downgrade():
    op.drop_table('treasury_audit_signature')
    op.drop_table('treasury_audit')
    op.drop_column('regular_member', 'is_auditor')

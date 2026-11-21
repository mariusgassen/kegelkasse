"""Club document review requests: Frist, recipients and reminder state.

Revision ID: 082
Revises: 081
Create Date: 2026-11-20
"""
from alembic import op
import sqlalchemy as sa

revision = '082'
down_revision = '081'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'club_document_review_request',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('club_document.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by_name', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('deadline', sa.Date(), nullable=False),
        sa.Column('reminder_days_before', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('auto_reminders', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('status', sa.String(), nullable=False, server_default='open'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_club_document_review_request_id', 'club_document_review_request', ['id'])
    op.create_index('ix_club_document_review_request_club_id', 'club_document_review_request', ['club_id'])
    op.create_index('ix_club_document_review_request_document_id', 'club_document_review_request', ['document_id'])
    op.create_index('ix_club_document_review_request_status', 'club_document_review_request', ['status'])
    op.create_table(
        'club_document_review_recipient',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column(
            'request_id', sa.Integer(),
            sa.ForeignKey('club_document_review_request.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('responder_name', sa.String(), nullable=False),
        sa.Column('notified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reminded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reminder_count', sa.Integer(), nullable=False, server_default='0'),
        sa.UniqueConstraint('request_id', 'user_id', name='uq_club_doc_review_recipient'),
    )
    op.create_index('ix_club_document_review_recipient_id', 'club_document_review_recipient', ['id'])
    op.create_index('ix_club_document_review_recipient_request_id', 'club_document_review_recipient', ['request_id'])


def downgrade():
    op.drop_table('club_document_review_recipient')
    op.drop_table('club_document_review_request')

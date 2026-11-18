"""Club documents: versioned PDFs with a per-member acknowledgement trail.
Revision ID: 076
Revises: 075
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa

revision = '076'
down_revision = '075'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'club_document',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('club_id', sa.Integer(), sa.ForeignKey('club.id', ondelete='CASCADE'), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('document_type', sa.String(), nullable=False, server_default='sonstiges'),
        sa.Column('version', sa.String(), nullable=True),
        sa.Column('decision_date', sa.Date(), nullable=True),
        sa.Column('effective_date', sa.Date(), nullable=True),
        sa.Column('file_key', sa.String(), nullable=False),
        sa.Column('file_name', sa.String(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('uploaded_by_name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_club_document_id', 'club_document', ['id'])
    op.create_index('ix_club_document_club_id', 'club_document', ['club_id'])
    op.create_index('ix_club_document_group_id', 'club_document', ['group_id'])
    op.create_table(
        'club_document_acknowledgement',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('club_document.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('responder_name', sa.String(), nullable=False),
        sa.Column('response', sa.String(), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('document_id', 'user_id', name='uq_club_document_ack_user'),
    )
    op.create_index('ix_club_document_acknowledgement_id', 'club_document_acknowledgement', ['id'])
    op.create_index('ix_club_document_acknowledgement_document_id', 'club_document_acknowledgement', ['document_id'])


def downgrade():
    op.drop_table('club_document_acknowledgement')
    op.drop_table('club_document')

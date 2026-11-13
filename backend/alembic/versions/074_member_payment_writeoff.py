"""Mark write-off bookings on member_payment.

A write-off settles a member's open debt (club exit) without any cash moving, so it must not
count as a deposit. Existing exit write-offs are recognised by the note the app wrote.

Revision ID: 074
Revises: 073
Create Date: 2026-11-13
"""
from alembic import op
import sqlalchemy as sa

revision = '074'
down_revision = '073'
branch_labels = None
depends_on = None

_LEGACY_NOTES = ("Vereinsaustritt – Strafen abgeschrieben", "Club exit – penalties written off")


def upgrade():
    op.add_column('member_payment', sa.Column('is_writeoff', sa.Boolean(), nullable=False, server_default=sa.false()))
    bind = op.get_bind()
    bind.execute(
        sa.text("UPDATE member_payment SET is_writeoff = :t WHERE amount > 0 AND note IN :notes")
        .bindparams(sa.bindparam("notes", expanding=True)),
        {"t": True, "notes": list(_LEGACY_NOTES)},
    )


def downgrade():
    op.drop_column('member_payment', 'is_writeoff')

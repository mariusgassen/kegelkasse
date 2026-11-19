"""Revoke extra roles from inactive users and users linked to deactivated regular members.

Revision ID: 081
Revises: 080
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa

revision = '081'
down_revision = '080'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    user_table = sa.table(
        'user',
        sa.column('id', sa.Integer),
        sa.column('roles', sa.JSON),
        sa.column('regular_member_id', sa.Integer),
        sa.column('is_active', sa.Boolean),
    )
    rm_table = sa.table(
        'regular_member',
        sa.column('id', sa.Integer),
        sa.column('user_id', sa.Integer),
        sa.column('is_active', sa.Boolean),
        sa.column('deactivated_at', sa.DateTime(timezone=True)),
    )

    rm_rows = bind.execute(
        sa.select(
            rm_table.c.id,
            rm_table.c.user_id,
            rm_table.c.is_active,
            rm_table.c.deactivated_at,
        )
    ).fetchall()
    rm_by_id = {r.id: r for r in rm_rows}
    rm_by_user_id = {r.user_id: r for r in rm_rows if r.user_id is not None}

    user_rows = bind.execute(
        sa.select(
            user_table.c.id,
            user_table.c.roles,
            user_table.c.regular_member_id,
            user_table.c.is_active,
        )
    ).fetchall()

    for u in user_rows:
        linked_rm = rm_by_id.get(u.regular_member_id) or rm_by_user_id.get(u.id)
        is_inactive = (not u.is_active) or (
            linked_rm is not None and (not linked_rm.is_active or linked_rm.deactivated_at is not None)
        )
        if is_inactive:
            bind.execute(
                user_table.update().where(user_table.c.id == u.id).values(roles=['member'], is_active=False)
            )


def downgrade():
    pass

"""Consolidate all permission roles into user.roles and drop user.role + regular_member office booleans.

Merges user.role and linked regular_member office flags (is_committee, is_auditor, is_zeugwart)
into user.roles, replaces product_manager, and drops the redundant columns.

Revision ID: 079
Revises: 078
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa

revision = '079'
down_revision = '078'
branch_labels = None
depends_on = None

_VALID_ROLES = {
    'superadmin', 'it_admin', 'admin', 'treasurer',
    'auditor', 'committee', 'zeugwart', 'member',
}


def upgrade():
    bind = op.get_bind()

    user_table = sa.table(
        'user',
        sa.column('id', sa.Integer),
        sa.column('role', sa.String),
        sa.column('roles', sa.JSON),
        sa.column('regular_member_id', sa.Integer),
    )
    rm_table = sa.table(
        'regular_member',
        sa.column('id', sa.Integer),
        sa.column('user_id', sa.Integer),
        sa.column('is_committee', sa.Boolean),
        sa.column('is_auditor', sa.Boolean),
        sa.column('is_zeugwart', sa.Boolean),
    )

    rm_rows = bind.execute(
        sa.select(
            rm_table.c.id,
            rm_table.c.user_id,
            rm_table.c.is_committee,
            rm_table.c.is_auditor,
            rm_table.c.is_zeugwart,
        )
    ).fetchall()
    rm_by_id = {r.id: r for r in rm_rows}
    rm_by_user_id = {r.user_id: r for r in rm_rows if r.user_id is not None}

    user_rows = bind.execute(
        sa.select(
            user_table.c.id,
            user_table.c.role,
            user_table.c.roles,
            user_table.c.regular_member_id,
        )
    ).fetchall()

    for u in user_rows:
        roles_set: set[str] = set()
        if isinstance(u.roles, list):
            for r in u.roles:
                if isinstance(r, str) and r in _VALID_ROLES:
                    roles_set.add(r)
        if u.role and str(u.role) in _VALID_ROLES:
            roles_set.add(str(u.role))

        linked_rm = rm_by_id.get(u.regular_member_id) or rm_by_user_id.get(u.id)
        if linked_rm:
            if linked_rm.is_committee:
                roles_set.add('committee')
            if linked_rm.is_auditor:
                roles_set.add('auditor')
            if linked_rm.is_zeugwart:
                roles_set.add('zeugwart')

        if not roles_set:
            roles_set.add('member')
        elif len(roles_set) > 1 and 'member' in roles_set:
            roles_set.discard('member')

        bind.execute(
            user_table.update().where(user_table.c.id == u.id).values(roles=sorted(roles_set))
        )

    op.drop_column('user', 'role')
    op.drop_column('regular_member', 'is_committee')
    op.drop_column('regular_member', 'is_auditor')
    op.drop_column('regular_member', 'is_zeugwart')


def downgrade():
    op.add_column('regular_member', sa.Column('is_zeugwart', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('regular_member', sa.Column('is_auditor', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('regular_member', sa.Column('is_committee', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('user', sa.Column('role', sa.String(), nullable=True, server_default='member'))

"""Backfill regular_member records for planned guests and approved guest requests.

Existing planned guests (scheduled_evening_guest) and approved guest requests (guest_request)
that were created prior to the eager-guest feature had regular_member_id = NULL. This migration
creates (or links existing same-named) RegularMember rows for them so they show up under
"Bekannte Gäste" right away.
"""
from alembic import op
import sqlalchemy as sa

revision = '071'
down_revision = '070'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    regular_member = sa.table(
        'regular_member',
        sa.column('id', sa.Integer),
        sa.column('club_id', sa.Integer),
        sa.column('name', sa.String),
        sa.column('nickname', sa.String),
        sa.column('is_guest', sa.Boolean),
        sa.column('is_active', sa.Boolean),
        sa.column('is_committee', sa.Boolean),
        sa.column('is_auditor', sa.Boolean),
        sa.column('is_zeugwart', sa.Boolean),
        sa.column('deactivated_at', sa.DateTime),
    )

    scheduled_evening = sa.table(
        'scheduled_evening',
        sa.column('id', sa.Integer),
        sa.column('club_id', sa.Integer),
    )

    scheduled_evening_guest = sa.table(
        'scheduled_evening_guest',
        sa.column('id', sa.Integer),
        sa.column('scheduled_evening_id', sa.Integer),
        sa.column('regular_member_id', sa.Integer),
        sa.column('name', sa.String),
    )

    guest_request = sa.table(
        'guest_request',
        sa.column('id', sa.Integer),
        sa.column('club_id', sa.Integer),
        sa.column('name', sa.String),
        sa.column('status', sa.String),
        sa.column('guest_id', sa.Integer),
    )

    # 1. Backfill scheduled_evening_guest rows without regular_member_id
    query_guests = (
        sa.select(
            scheduled_evening_guest.c.id.label('guest_id'),
            scheduled_evening_guest.c.name.label('guest_name'),
            scheduled_evening.c.club_id.label('club_id'),
        )
        .select_from(
            scheduled_evening_guest.join(
                scheduled_evening,
                scheduled_evening.c.id == scheduled_evening_guest.c.scheduled_evening_id,
            )
        )
        .where(scheduled_evening_guest.c.regular_member_id.is_(None))
        .order_by(scheduled_evening_guest.c.id.asc())
    )

    for row in conn.execute(query_guests).fetchall():
        name = row.guest_name.strip()
        club_id = row.club_id
        if not name or not club_id:
            continue

        # Look for existing active guest or deactivated member with the same full name
        match_query = (
            sa.select(regular_member.c.id, regular_member.c.nickname, regular_member.c.name)
            .where(
                regular_member.c.club_id == club_id,
                regular_member.c.is_active == True,  # noqa: E712
                sa.or_(
                    regular_member.c.is_guest == True,  # noqa: E712
                    regular_member.c.deactivated_at.isnot(None),
                ),
                sa.func.lower(regular_member.c.name) == name.lower(),
            )
            .order_by(regular_member.c.is_guest.desc(), regular_member.c.id.asc())
            .limit(1)
        )
        existing = conn.execute(match_query).fetchone()
        if existing:
            member_id = existing[0]
            display_name = existing[1] or existing[2]
        else:
            ins = regular_member.insert().values(
                club_id=club_id,
                name=name,
                is_guest=True,
                is_active=True,
                is_committee=False,
                is_auditor=False,
                is_zeugwart=False,
            )
            conn.execute(ins)
            member_id = conn.execute(match_query).fetchone()[0]
            display_name = name

        conn.execute(
            scheduled_evening_guest.update()
            .where(scheduled_evening_guest.c.id == row.guest_id)
            .values(regular_member_id=member_id, name=display_name)
        )

    # 2. Approved guest requests (in case guest_id was unlinked or missing)
    query_reqs = (
        sa.select(guest_request.c.id, guest_request.c.club_id, guest_request.c.name)
        .where(guest_request.c.status == 'approved')
        .order_by(guest_request.c.id.asc())
    )
    for row in conn.execute(query_reqs).fetchall():
        name = row.name.strip()
        club_id = row.club_id
        if not name or not club_id:
            continue
        match_query = (
            sa.select(regular_member.c.id)
            .where(
                regular_member.c.club_id == club_id,
                regular_member.c.is_active == True,  # noqa: E712
                sa.or_(
                    regular_member.c.is_guest == True,  # noqa: E712
                    regular_member.c.deactivated_at.isnot(None),
                ),
                sa.func.lower(regular_member.c.name) == name.lower(),
            )
            .limit(1)
        )
        if not conn.execute(match_query).fetchone():
            conn.execute(
                regular_member.insert().values(
                    club_id=club_id,
                    name=name,
                    is_guest=True,
                    is_active=True,
                    is_committee=False,
                    is_auditor=False,
                    is_zeugwart=False,
                )
            )


def downgrade():
    pass

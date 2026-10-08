"""Scheduled evenings and RSVP management — plan future bowling sessions in advance."""
import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Optional

from babel.dates import format_datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from fastapi.responses import Response
from core.schemas import TrimmedModel
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_club_admin
from core.clubtime import wall_to_utc, wall_now
from api.v1.evenings import _parse_date, _do_calculate_absence_penalties
from core.database import get_db
from core.email import email_theme
from core.i18n import t as tr
from core.push import push_to_regular_member, push_to_club
from models.club import Club, ClubSettings
from models.committee import ClubTrip
from models.evening import RegularMember, Evening, EveningPlayer
from models.schedule import ScheduledEvening, MemberRsvp, RsvpStatus, ScheduledEveningGuest
from models.season import SeasonSnapshot
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schedule", tags=["schedule"])



def _serialize_guest(g: ScheduledEveningGuest) -> dict:
    return {"id": g.id, "name": g.name, "regular_member_id": g.regular_member_id}


def _serialize_scheduled_evening(se: ScheduledEvening, my_regular_member_id: Optional[int], db=None) -> dict:
    attending = [r for r in se.rsvps if r.status == RsvpStatus.attending]
    absent = [r for r in se.rsvps if r.status == RsvpStatus.absent]
    my_rsvp = None
    if my_regular_member_id:
        for r in se.rsvps:
            if r.regular_member_id == my_regular_member_id:
                my_rsvp = r.status
                break
    sa_utc = se.scheduled_at.astimezone(UTC) if se.scheduled_at.tzinfo else se.scheduled_at.replace(tzinfo=UTC)
    # Find the linked Evening (non-closed takes priority, else any linked)
    linked_evening_id = None
    if db is not None:
        linked = db.query(Evening).filter(
            Evening.scheduled_evening_id == se.id,
        ).order_by(Evening.is_closed).first()
        if linked:
            linked_evening_id = linked.id
    return {
        "id": se.id,
        "scheduled_at": sa_utc.strftime('%Y-%m-%dT%H:%M'),
        "venue": se.venue,
        "note": se.note,
        "created_at": se.created_at.isoformat() if se.created_at else None,
        "attending_count": len(attending),
        "absent_count": len(absent),
        "my_rsvp": my_rsvp,
        "guests": [_serialize_guest(g) for g in se.guests],
        "evening_id": linked_evening_id,
        "guest_requests_enabled": bool(se.guest_requests_enabled),
    }


def _get_se(sid: int, club_id: int, db: Session) -> ScheduledEvening:
    se = db.query(ScheduledEvening).filter(
        ScheduledEvening.id == sid, ScheduledEvening.club_id == club_id,
        ScheduledEvening.is_deleted == False,
    ).first()
    if not se:
        raise HTTPException(404, "Scheduled evening not found")
    return se


# ── Scheduled Evening CRUD ────────────────────────────────────────────────────

@router.get("/")
def list_scheduled_evenings(
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    items = db.query(ScheduledEvening).filter(
        ScheduledEvening.club_id == user.club_id,
        ScheduledEvening.is_deleted == False,
    ).order_by(ScheduledEvening.scheduled_at).all()
    return [_serialize_scheduled_evening(se, user.regular_member_id, db) for se in items]


class ScheduledEveningCreate(TrimmedModel):
    date: str = None
    venue: Optional[str] = None
    note: Optional[str] = None
    guest_requests_enabled: bool = True  # public "Gastkegeln anfragen" link for this evening


@router.post("/")
def create_scheduled_evening(
    data: ScheduledEveningCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    scheduled_at = _parse_date(data.date)
    se = ScheduledEvening(
        club_id=user.club_id,
        created_by=user.id,
        scheduled_at=scheduled_at,
        venue=data.venue,
        note=data.note,
        guest_requests_enabled=data.guest_requests_enabled,
    )
    db.add(se)
    db.commit()
    db.refresh(se)
    logger.info("Scheduled evening created: id=%d club=%d user=%d date=%s", se.id, user.club_id, user.id, scheduled_at.isoformat())
    date_str = format_datetime(se.scheduled_at, locale=user.preferred_locale)
    venue_str = f" · {se.venue}" if se.venue else ""
    background_tasks.add_task(
    push_to_club,
        db,
        user.club_id,
        "📅 Neuer Kegeltermin",
        f"Kegelabend am {date_str}{venue_str} eingetragen.",
        f"/#schedule?event={se.id}",
        category="schedule",
    )
    return _serialize_scheduled_evening(se, user.regular_member_id, db)


class ScheduledEveningUpdate(TrimmedModel):
    date: Optional[str] = None
    venue: Optional[str] = None
    note: Optional[str] = None
    guest_requests_enabled: Optional[bool] = None


@router.patch("/{sid}")
def update_scheduled_evening(
    sid: int,
    data: ScheduledEveningUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    old_date = se.scheduled_at
    updates = data.model_dump(exclude_none=True)
    if "date" in updates:
        updates["scheduled_at"] = _parse_date(updates.pop("date"))
    for k, v in updates.items():
        setattr(se, k, v)
    db.commit()
    db.refresh(se)
    new_date = se.scheduled_at
    if (abs(old_date - new_date) / 60.0).seconds > 60:
        background_tasks.add_task(
        push_to_club,
        db,
        user.club_id,
        "📅 Kegeltermin verschoben",
        f"Kegelabend verschoben von {format_datetime(old_date, user.preferred_locale)} auf {format_datetime(old_date, user.preferred_locale)}.",
        f"/#schedule?event={se.id}",
        category="schedule",
        )
    return _serialize_scheduled_evening(se, user.regular_member_id, db)


@router.delete("/{sid}", status_code=204)
def delete_scheduled_evening(
    sid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    se.is_deleted = True
    db.commit()
    logger.info("Scheduled evening deleted: id=%d club=%d user=%d", sid, user.club_id, user.id)


# ── Guests ────────────────────────────────────────────────────────────────────

class GuestCreate(TrimmedModel):
    name: str
    regular_member_id: Optional[int] = None


@router.post("/{sid}/guests")
def add_guest(
    sid: int,
    data: GuestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    guest = ScheduledEveningGuest(
        scheduled_evening_id=se.id,
        name=data.name.strip(),
        regular_member_id=data.regular_member_id,
    )
    db.add(guest)
    db.commit()
    db.refresh(guest)
    return _serialize_guest(guest)


@router.delete("/{sid}/guests/{gid}", status_code=204)
def remove_guest(
    sid: int,
    gid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    guest = db.query(ScheduledEveningGuest).filter(
        ScheduledEveningGuest.id == gid,
        ScheduledEveningGuest.scheduled_evening_id == se.id,
    ).first()
    if not guest:
        raise HTTPException(404, "Guest not found")
    db.delete(guest)
    db.commit()


# ── Start evening from scheduled ──────────────────────────────────────────────

class StartEveningBody(TrimmedModel):
    member_ids: list[int] = []


@router.post("/{sid}/start")
def start_evening(
    sid: int,
    data: StartEveningBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    """Create an actual Evening from a ScheduledEvening, importing specified members and all planned guests."""
    se = _get_se(sid, user.club_id, db)

    # Ensure no other evening is currently open for this club
    other_open = db.query(Evening).filter(
        Evening.club_id == se.club_id,
        Evening.is_closed == False,
    ).first()
    if other_open:
        raise HTTPException(400, "Another evening is already active")

    # Block starting an evening in a closed season
    evening_year = se.scheduled_at.year
    season_snap = db.query(SeasonSnapshot).filter(
        SeasonSnapshot.club_id == se.club_id,
        SeasonSnapshot.year == evening_year,
    ).first()
    if season_snap:
        raise HTTPException(400, f"Season {evening_year} is closed")

    ev = Evening(
        club_id=se.club_id,
        date=se.scheduled_at,
        venue=se.venue,
        note=se.note,
        scheduled_evening_id=se.id,
        created_by=user.id,
    )
    db.add(ev)
    db.flush()

    added_member_ids: set[int] = set()

    for mid in data.member_ids:
        member = db.query(RegularMember).filter(
            RegularMember.id == mid,
            RegularMember.club_id == se.club_id,
        ).first()
        if member:
            db.add(EveningPlayer(
                evening_id=ev.id,
                regular_member_id=member.id,
                name=member.nickname or member.name,
            ))
            added_member_ids.add(member.id)

    for guest in se.guests:
        # Skip if the guest is a known member already added
        if guest.regular_member_id and guest.regular_member_id in added_member_ids:
            continue
        rm_id = guest.regular_member_id
        if not rm_id:
            # Create a RegularMember record for this guest so evening_player has a proper link
            rm = RegularMember(
                club_id=se.club_id,
                name=guest.name,
                is_guest=True,
                is_active=True,
            )
            db.add(rm)
            db.flush()
            rm_id = rm.id
            # Link back to the ScheduledEveningGuest so future references work
            guest.regular_member_id = rm_id
        db.add(EveningPlayer(
            evening_id=ev.id,
            regular_member_id=rm_id,
            name=guest.name,
        ))
        added_member_ids.add(rm_id)

    db.commit()
    db.refresh(ev)

    # Auto-create absence penalties for members who explicitly cancelled (RSVP absent)
    absent_rsvps = db.query(MemberRsvp).filter(
        MemberRsvp.scheduled_evening_id == se.id,
        MemberRsvp.status == RsvpStatus.absent,
    ).all()
    if absent_rsvps:
        _do_calculate_absence_penalties(ev, background_tasks, db, user.id)

    # Notify members who RSVP'd attending
    attending_rsvps = db.query(MemberRsvp).filter(
        MemberRsvp.scheduled_evening_id == se.id,
        MemberRsvp.status == RsvpStatus.attending,
    ).all()
    ev_date_str = ev.date.strftime('%d.%m.%Y')
    for rsvp in attending_rsvps:
        background_tasks.add_task(
            push_to_regular_member, db, rsvp.regular_member_id, "🎳 Kegelabend gestartet",
            f"Abend vom {ev_date_str} hat begonnen.", "/", "evenings")

    logger.info("Evening started from schedule: evening=%d schedule=%d club=%d user=%d players=%d",
                ev.id, sid, user.club_id, user.id, len(added_member_ids))
    return {"id": ev.id, "date": ev.date.isoformat(), "venue": ev.venue}


# ── RSVP ──────────────────────────────────────────────────────────────────────

class RsvpSet(TrimmedModel):
    status: str  # "attending" | "absent"


@router.post("/{sid}/rsvp")
def set_rsvp(
    sid: int,
    data: RsvpSet,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    if data.status not in (RsvpStatus.attending, RsvpStatus.absent):
        raise HTTPException(400, "Invalid status — use 'attending' or 'absent'")

    _get_se(sid, user.club_id, db)  # verify exists + membership
    if not user.regular_member_id:
        raise HTTPException(400, "No roster entry linked to your account")

    rsvp = db.query(MemberRsvp).filter(
        MemberRsvp.scheduled_evening_id == sid,
        MemberRsvp.regular_member_id == user.regular_member_id,
    ).first()
    if rsvp:
        rsvp.status = data.status
    else:
        rsvp = MemberRsvp(
            scheduled_evening_id=sid,
            regular_member_id=user.regular_member_id,
            status=data.status,
        )
        db.add(rsvp)
    db.commit()
    logger.info("RSVP set: schedule=%d member=%d status=%s", sid, user.regular_member_id, data.status)
    return {"status": data.status}


@router.post("/{sid}/rsvp/member/{mid}")
def set_rsvp_for_member(
    sid: int,
    mid: int,
    data: RsvpSet,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    if data.status not in (RsvpStatus.attending, RsvpStatus.absent):
        raise HTTPException(400, "Invalid status")

    _get_se(sid, user.club_id, db)  # verify exists + admin access
    member = db.query(RegularMember).filter(
        RegularMember.id == mid, RegularMember.club_id == user.club_id
    ).first()
    if not member:
        raise HTTPException(404, "Member not found")

    rsvp = db.query(MemberRsvp).filter(
        MemberRsvp.scheduled_evening_id == sid,
        MemberRsvp.regular_member_id == mid,
    ).first()
    if rsvp:
        rsvp.status = data.status
    else:
        rsvp = MemberRsvp(scheduled_evening_id=sid, regular_member_id=mid, status=data.status)
        db.add(rsvp)
    db.commit()
    return {"status": data.status}


@router.delete("/{sid}/rsvp", status_code=204)
def remove_rsvp(
    sid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    if not user.regular_member_id:
        raise HTTPException(400, "No roster entry linked to your account")
    rsvp = db.query(MemberRsvp).filter(
        MemberRsvp.scheduled_evening_id == sid,
        MemberRsvp.regular_member_id == user.regular_member_id,
    ).first()
    if rsvp:
        db.delete(rsvp)
        db.commit()


@router.get("/{sid}/rsvps")
def list_rsvps(
    sid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    all_members = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
        RegularMember.deactivated_at.is_(None),
    ).all()
    rsvp_map = {r.regular_member_id: r.status for r in se.rsvps}
    return [
        {
            "regular_member_id": m.id,
            "name": m.name,
            "nickname": m.nickname,
            "status": rsvp_map.get(m.id),
        }
        for m in all_members
    ]


@router.post("/{sid}/remind")
def send_reminder(
    sid: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    responded_ids = {r.regular_member_id for r in se.rsvps}
    non_responders = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
        RegularMember.deactivated_at.is_(None),
        ~RegularMember.id.in_(responded_ids),
    ).all()
    se_date_str = se.scheduled_at.astimezone(UTC).strftime('%d.%m.%Y')
    venue_str = f" ({se.venue})" if se.venue else ""
    for member in non_responders:
        background_tasks.add_task(
            push_to_regular_member, db, member.id,
            "🎳 Bist du dabei?",
            f"Kegelabend am {se_date_str}{venue_str} — bitte melde dich an oder ab.",
            f"/#schedule?event={se.id}", "schedule",
        )
    return {"reminded_count": len(non_responders)}


# ── iCal export ───────────────────────────────────────────────────────────────

# UTC "form #2" date-time (RFC 5545 §3.3.5). The trailing Z matters: without it the value is a
# *floating* time that calendar apps read as their own local time, shifting every evening by the
# viewer's UTC offset (1–2 h in Germany).
_ICAL_UTC = '%Y%m%dT%H%M%SZ'


def _ical_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ical_fold(line: str) -> str:
    """Fold long lines per RFC 5545 (max 75 octets, continuation with CRLF + space).

    Folds between characters, never inside a multi-byte one: slicing the encoded bytes at a fixed
    offset can cut an umlaut or emoji in half, which is invalid UTF-8 (and raised on decode).
    """
    if len(line.encode("utf-8")) <= 75:
        return line + "\r\n"
    chunks: list[str] = []
    current = ""
    limit = 75  # the first line has no leading space; continuation lines lose one octet to it
    for ch in line:
        if len((current + ch).encode("utf-8")) > limit:
            chunks.append(current)
            current, limit = ch, 74
        else:
            current += ch
    chunks.append(current)
    return "\r\n ".join(chunks) + "\r\n"


@router.get("/ical-token")
def get_ical_token(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """The caller's personal calendar-feed token, created on first use."""
    if not user.ical_token:
        user.ical_token = secrets.token_urlsafe(24)
        db.commit()
    return {"ical_token": user.ical_token}


@router.post("/ical-token/regenerate")
def regenerate_my_ical_token(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Rotate only the caller's feed token (invalidates just their old link)."""
    user.ical_token = secrets.token_urlsafe(24)
    db.commit()
    return {"ical_token": user.ical_token}


def _rsvp_by_evening(db: Session, member_id: int | None) -> dict[int, str]:
    if not member_id:
        return {}
    rows = db.query(MemberRsvp).filter(MemberRsvp.regular_member_id == member_id).all()
    return {r.scheduled_evening_id: r.status for r in rows}


def _app_base_url(club: Club, request: Request) -> str:
    """Where the app lives, for deep links inside calendar entries.

    Prefers the club's own domain / APP_BASE_URL (the same source the emails use); otherwise the
    host the calendar client reached us on, forced to https unless it is a local dev host.
    """
    configured = email_theme(club).get("base_url")
    if configured:
        return configured.rstrip("/")
    host = request.url.netloc
    local = host.startswith(("localhost", "127.", "0.0.0.0"))
    return f"{'http' if local else 'https'}://{host}"


def _display_names(members) -> list[str]:
    return sorted((m.nickname or m.name for m in members), key=str.casefold)


def _attendee_lines(se: ScheduledEvening, roster: list[RegularMember], locale: str | None) -> list[str]:
    """Who is coming, same opt-out model as the in-app RSVP sheet: every active roster member
    attends unless they declined; planned guests come on top (a guest entry that points at a
    roster member is not listed twice)."""
    absent_ids = {r.regular_member_id for r in se.rsvps if r.status == RsvpStatus.absent}
    roster_ids = {m.id for m in roster}
    attending = _display_names(m for m in roster if m.id not in absent_ids)
    absent = _display_names(m for m in roster if m.id in absent_ids)
    guests = sorted((g.name for g in se.guests if g.regular_member_id not in roster_ids), key=str.casefold)
    out = []
    for key, names in (("ical.attendees", attending), ("ical.absentees", absent), ("ical.guests", guests)):
        if names:
            out.append(tr(locale, key, n=len(names), names=", ".join(names)))
    return out


def _utc_day(dt: datetime):
    return (dt.astimezone(UTC) if dt.tzinfo else dt).date()


def _trip_events(db: Session, club: Club, locale: str | None, app_url: str | None, dtstamp: str) -> list[str]:
    """Kegelfahrten as all-day events (multi-day when the trip has an end date).

    iCal all-day ``DTEND`` is exclusive, so it is the day *after* the last day of the trip.
    Deleted trips stay in the feed as CANCELLED so entries already synced to a calendar vanish.
    """
    out: list[str] = []
    trips = db.query(ClubTrip).filter(ClubTrip.club_id == club.id).order_by(ClubTrip.date).all()
    for trip in trips:
        first = _utc_day(trip.date)
        last = max(first, _utc_day(trip.end_date)) if trip.end_date else first
        url = f"{app_url}/committee?tab=trips&item={trip.id}" if app_url else None
        summary = f"🚌 {tr(locale, 'ical.trip')} · {trip.destination}"
        details = [trip.note] if trip.note else []
        if url and not trip.is_deleted:
            details.append(tr(locale, "ical.open", url=url))
        out.append("BEGIN:VEVENT\r\n")
        out.append(f"UID:kegelkasse-trip-{trip.id}@kegelkasse\r\n")
        out.append(f"DTSTAMP:{dtstamp}\r\n")
        out.append(f"DTSTART;VALUE=DATE:{first.strftime('%Y%m%d')}\r\n")
        out.append(f"DTEND;VALUE=DATE:{(last + timedelta(days=1)).strftime('%Y%m%d')}\r\n")
        out.append(_ical_fold(f"SUMMARY:{_ical_escape(summary)}"))
        if trip.is_deleted:
            out.append("STATUS:CANCELLED\r\n")
        elif url:
            out.append(_ical_fold(f"URL:{url}"))
        if details:
            description = "\n\n".join(details)
            out.append(_ical_fold(f"DESCRIPTION:{_ical_escape(description)}"))
        out.append("END:VEVENT\r\n")
    return out


@router.get("/ical/{token}.ics", include_in_schema=False)
def export_ical(token: str, request: Request, db: Session = Depends(get_db)):
    """Public iCal feed, authenticated by a secret token in the URL.

    A personal token (``user.ical_token``) additionally marks each event with that member's RSVP.
    The legacy club-wide token (``club_settings.extra``) still works but cannot know who is
    subscribing, so it serves the plain, unpersonalized feed.
    """
    import json

    subscriber = db.query(User).filter(User.ical_token == token, User.is_active.is_(True)).first()
    club_id = None
    if subscriber and subscriber.club_id:
        club_id = subscriber.club_id
    else:
        subscriber = None
        for s in db.query(ClubSettings).all():
            extra = s.extra or {}
            if isinstance(extra, str):
                extra = json.loads(extra)
            if extra.get("ical_token") == token:
                club_id = s.club_id
                break

    if club_id is None:
        raise HTTPException(404, "Invalid token")

    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(404, "Club not found")

    locale = subscriber.preferred_locale if subscriber else None
    personal = subscriber is not None and subscriber.regular_member_id is not None
    rsvps = _rsvp_by_evening(db, subscriber.regular_member_id) if personal else {}

    evenings = db.query(ScheduledEvening).filter(
        ScheduledEvening.club_id == club.id,
    ).order_by(ScheduledEvening.scheduled_at).all()

    # Names and the app link go only into personal feeds: the legacy club-wide token is a shared
    # secret that has been passed around, so it stays at event basics.
    roster = db.query(RegularMember).filter(
        RegularMember.club_id == club.id,
        RegularMember.is_active.is_(True),
        RegularMember.is_guest.is_(False),
        RegularMember.deactivated_at.is_(None),
    ).all() if subscriber else []
    app_url = _app_base_url(club, request) if subscriber else None

    now_wall = wall_now()
    lines: list[str] = [
        "BEGIN:VCALENDAR\r\n",
        "VERSION:2.0\r\n",
        "PRODID:-//Kegelkasse//Kegeltermine//DE\r\n",
        "CALSCALE:GREGORIAN\r\n",
        "METHOD:PUBLISH\r\n",
        _ical_fold(f"X-WR-CALNAME:{_ical_escape(tr(locale, 'ical.calname', club=club.name))}"),
        # Hint for clients that honour it; RSVP changes should show up within the hour.
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n",
        "X-PUBLISHED-TTL:PT1H\r\n",
    ]

    # RFC 5545: DTSTAMP is required on every VEVENT; it's the time the feed was generated.
    dtstamp = datetime.now(UTC).strftime(_ICAL_UTC)

    for se in evenings:
        # The stored value is the club's wall-clock time, not a UTC instant (see core/clubtime.py).
        sa_utc = wall_to_utc(se.scheduled_at)
        start_str = sa_utc.strftime(_ICAL_UTC)
        # timedelta rather than (hour + 3) % 24, which put the end *before* the start (same date,
        # earlier hour) for any evening starting late enough to cross midnight.
        end_str = (sa_utc + timedelta(hours=3)).strftime(_ICAL_UTC)

        summary_parts = [tr(locale, "ical.event")]
        if se.venue:
            summary_parts.append(se.venue)
        summary = " · ".join(summary_parts)

        rsvp = rsvps.get(se.id) if personal else None
        if personal:
            if rsvp == RsvpStatus.attending:
                status_key, mark = "ical.rsvp.attending", "CONFIRMED"
            elif rsvp == RsvpStatus.absent:
                # Declined: cancel the event in this member's calendar so it disappears from it.
                status_key, mark = "ical.rsvp.absent", "CANCELLED"
            else:
                status_key, mark = "ical.rsvp.none", "TENTATIVE"

        lines.append("BEGIN:VEVENT\r\n")
        lines.append(f"UID:kegelkasse-{se.id}@kegelkasse\r\n")
        lines.append(f"DTSTAMP:{dtstamp}\r\n")
        lines.append(f"DTSTART:{start_str}\r\n")
        lines.append(f"DTEND:{end_str}\r\n")
        lines.append(_ical_fold(f"SUMMARY:{_ical_escape(summary)}"))
        details: list[str] = []
        event_url = f"{app_url}/schedule?evening={se.id}" if app_url else None
        if se.is_deleted:
            lines.append("STATUS:CANCELLED\r\n")
        elif personal:
            lines.append(f"STATUS:{mark}\r\n")
            details.append(tr(locale, "ical.rsvp.label", status=tr(locale, status_key)))
        if se.note:
            details.append(se.note)
        if subscriber and not se.is_deleted:
            people = _attendee_lines(se, roster, locale)
            if people:
                details.append("\n".join(people))
        if event_url and not se.is_deleted:
            details.append(tr(locale, "ical.open", url=event_url))
            lines.append(_ical_fold(f"URL:{event_url}"))
            # Opens the app's own Zu-/Absage sheet (needs the member's normal login; the sheet
            # asks for an explicit tap, so a link previewer can never change an answer).
            if personal and se.scheduled_at.replace(tzinfo=UTC) >= now_wall:
                details.append(tr(locale, "ical.rsvp.link", url=f"{app_url}/schedule?rsvp={se.id}"))
        description = "\n\n".join(details)
        if se.venue:
            lines.append(_ical_fold(f"LOCATION:{_ical_escape(se.venue)}"))
        if description:
            lines.append(_ical_fold(f"DESCRIPTION:{_ical_escape(description)}"))
        lines.append("END:VEVENT\r\n")

    if subscriber:
        lines.extend(_trip_events(db, club, locale, app_url, dtstamp))

    lines.append("END:VCALENDAR\r\n")

    content = "".join(lines)
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="kegeltermine.ics"'},
    )

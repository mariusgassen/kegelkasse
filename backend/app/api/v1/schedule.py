"""Scheduled evenings and RSVP management — plan future bowling sessions in advance."""
from datetime import datetime, UTC
from typing import Optional

from babel.dates import format_datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_club_admin
from core.database import get_db
from core.push import push_to_regular_member, push_to_club
from models.club import Club, ClubSettings
from models.evening import RegularMember, Evening, EveningPlayer
from models.schedule import ScheduledEvening, MemberRsvp, RsvpStatus, ScheduledEveningGuest
from models.user import User

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _parse_scheduled_at(date_str: str, time_str: Optional[str]) -> datetime:
    """Combine YYYY-MM-DD date and optional HH:MM time into a timezone-aware datetime (UTC, default 20:00)."""
    t = time_str or "20:00"
    try:
        h, m = t.split(":")
    except (ValueError, AttributeError):
        h, m = "20", "00"
    d = date_str[:10]
    return datetime(int(d[:4]), int(d[5:7]), int(d[8:10]), int(h), int(m), 0, tzinfo=UTC)


def _serialize_guest(g: ScheduledEveningGuest) -> dict:
    return {"id": g.id, "name": g.name, "regular_member_id": g.regular_member_id}


def _serialize_scheduled_evening(se: ScheduledEvening, my_regular_member_id: Optional[int]) -> dict:
    attending = [r for r in se.rsvps if r.status == RsvpStatus.attending]
    absent = [r for r in se.rsvps if r.status == RsvpStatus.absent]
    my_rsvp = None
    if my_regular_member_id:
        for r in se.rsvps:
            if r.regular_member_id == my_regular_member_id:
                my_rsvp = r.status
                break
    sa_utc = se.scheduled_at.astimezone(UTC) if se.scheduled_at.tzinfo else se.scheduled_at.replace(tzinfo=UTC)
    return {
        "id": se.id,
        "date": sa_utc.strftime('%Y-%m-%d'),
        "time": sa_utc.strftime('%H:%M'),
        "venue": se.venue,
        "note": se.note,
        "created_at": se.created_at.isoformat() if se.created_at else None,
        "attending_count": len(attending),
        "absent_count": len(absent),
        "my_rsvp": my_rsvp,
        "guests": [_serialize_guest(g) for g in se.guests],
    }


def _get_se(sid: int, club_id: int, db: Session) -> ScheduledEvening:
    se = db.query(ScheduledEvening).filter(
        ScheduledEvening.id == sid, ScheduledEvening.club_id == club_id
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
    ).order_by(ScheduledEvening.scheduled_at).all()
    return [_serialize_scheduled_evening(se, user.regular_member_id) for se in items]


class ScheduledEveningCreate(BaseModel):
    date: str
    time: Optional[str] = None
    venue: Optional[str] = None
    note: Optional[str] = None


@router.post("/")
def create_scheduled_evening(
    data: ScheduledEveningCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = ScheduledEvening(
        club_id=user.club_id,
        created_by=user.id,
        scheduled_at=_parse_scheduled_at(data.date, data.time),
        venue=data.venue,
        note=data.note,
    )
    db.add(se)
    db.commit()
    db.refresh(se)
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
    return _serialize_scheduled_evening(se, user.regular_member_id)


class ScheduledEveningUpdate(BaseModel):
    date: Optional[str] = None
    time: Optional[str] = None
    venue: Optional[str] = None
    note: Optional[str] = None


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
    if "date" in updates or "time" in updates:
        current_utc = se.scheduled_at.astimezone(UTC)
        new_date = updates.pop("date", current_utc.strftime('%Y-%m-%d'))
        new_time = updates.pop("time", current_utc.strftime('%H:%M'))
        updates["scheduled_at"] = _parse_scheduled_at(new_date, new_time)
    for k, v in updates.items():
        setattr(se, k, v)
    db.commit()
    db.refresh(se)
    new_date = se.scheduled_at
    if abs(old_date - new_date) / 60.0 >= 60:
        background_tasks.add_task(
        push_to_club,
        db,
        user.club_id,
        "📅 Kegeltermin verschoben",
        f"Kegelabend verschoben von {format_datetime(old_date, user.preferred_locale)} auf {format_datetime(old_date, user.preferred_locale)}.",
        f"/#schedule?event={se.id}",
        category="schedule",
        )
    return _serialize_scheduled_evening(se, user.regular_member_id)


@router.delete("/{sid}", status_code=204)
def delete_scheduled_evening(
    sid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    db.delete(se)
    db.commit()


# ── Guests ────────────────────────────────────────────────────────────────────

class GuestCreate(BaseModel):
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

class StartEveningBody(BaseModel):
    member_ids: list[int] = []


@router.post("/{sid}/start")
def start_evening(
    sid: int,
    data: StartEveningBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """Create an actual Evening from a ScheduledEvening, importing specified members and all planned guests."""
    se = _get_se(sid, user.club_id, db)

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
        db.add(EveningPlayer(
            evening_id=ev.id,
            regular_member_id=guest.regular_member_id,
            name=guest.name,
        ))
        if guest.regular_member_id:
            added_member_ids.add(guest.regular_member_id)

    db.commit()
    db.refresh(ev)

    # Notify members who RSVP'd attending
    attending_rsvps = db.query(MemberRsvp).filter(
        MemberRsvp.scheduled_evening_id == se.id,
        MemberRsvp.status == RsvpStatus.attending,
    ).all()
    ev_date_str = ev.date.strftime('%d.%m.%Y')
    for rsvp in attending_rsvps:
        push_to_regular_member(db, rsvp.regular_member_id, "🎳 Kegelabend gestartet",
                               f"Abend vom {ev_date_str} hat begonnen.", "/", category="evenings")

    return {"id": ev.id, "date": ev.date.isoformat(), "venue": ev.venue}


# ── RSVP ──────────────────────────────────────────────────────────────────────

class RsvpSet(BaseModel):
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
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    responded_ids = {r.regular_member_id for r in se.rsvps}
    non_responders = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
        ~RegularMember.id.in_(responded_ids),
    ).all()
    se_date_str = se.scheduled_at.astimezone(UTC).strftime('%d.%m.%Y')
    venue_str = f" ({se.venue})" if se.venue else ""
    for member in non_responders:
        push_to_regular_member(
            db, member.id,
            "🎳 Bist du dabei?",
            f"Kegelabend am {se_date_str}{venue_str} — bitte melde dich an oder ab.",
            f"/#schedule?event={se.id}",
            category="schedule",
        )
    return {"reminded_count": len(non_responders)}


# ── iCal export ───────────────────────────────────────────────────────────────

def _ical_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ical_fold(line: str) -> str:
    """Fold long lines per RFC 5545 (max 75 octets, continuation with CRLF + space)."""
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line + "\r\n"
    result = b""
    while len(encoded) > 75:
        result += encoded[:75] + b"\r\n "
        encoded = encoded[75:]
    result += encoded + b"\r\n"
    return result.decode("utf-8")


@router.get("/ical/{token}.ics", include_in_schema=False)
def export_ical(token: str, db: Session = Depends(get_db)):
    """Public iCal feed — authenticated by secret token stored in club_settings.extra."""
    import json

    # Find club by ical_token
    rows = db.query(ClubSettings).all()
    club_settings = None
    for s in rows:
        extra = s.extra or {}
        if isinstance(extra, str):
            extra = json.loads(extra)
        if extra.get("ical_token") == token:
            club_settings = s
            break

    if not club_settings:
        raise HTTPException(404, "Invalid token")

    club = db.query(Club).filter(Club.id == club_settings.club_id).first()
    if not club:
        raise HTTPException(404, "Club not found")

    evenings = db.query(ScheduledEvening).filter(
        ScheduledEvening.club_id == club.id,
    ).order_by(ScheduledEvening.scheduled_at).all()

    lines: list[str] = [
        "BEGIN:VCALENDAR\r\n",
        "VERSION:2.0\r\n",
        "PRODID:-//Kegelkasse//Kegeltermine//DE\r\n",
        "CALSCALE:GREGORIAN\r\n",
        "METHOD:PUBLISH\r\n",
        _ical_fold(f"X-WR-CALNAME:Kegeltermine – {club.name}"),
    ]

    for se in evenings:
        sa_utc = se.scheduled_at.astimezone(UTC)
        start_h = sa_utc.hour
        start_m = sa_utc.minute
        end_h = (start_h + 3) % 24

        date_compact = sa_utc.strftime('%Y%m%d')
        start_str = f"{date_compact}T{start_h:02d}{start_m:02d}00"
        end_str = f"{date_compact}T{end_h:02d}{start_m:02d}00"

        summary_parts = ["Kegelabend"]
        if se.venue:
            summary_parts.append(se.venue)
        summary = " · ".join(summary_parts)

        lines.append("BEGIN:VEVENT\r\n")
        lines.append(f"UID:kegelkasse-{se.id}@kegelkasse\r\n")
        lines.append(f"DTSTART:{start_str}\r\n")
        lines.append(f"DTEND:{end_str}\r\n")
        lines.append(_ical_fold(f"SUMMARY:{_ical_escape(summary)}"))
        if se.venue:
            lines.append(_ical_fold(f"LOCATION:{_ical_escape(se.venue)}"))
        if se.note:
            lines.append(_ical_fold(f"DESCRIPTION:{_ical_escape(se.note)}"))
        lines.append("END:VEVENT\r\n")

    lines.append("END:VCALENDAR\r\n")

    content = "".join(lines)
    return Response(
        content=content,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="kegeltermine.ics"'},
    )

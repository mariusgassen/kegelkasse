"""Scheduled evenings and RSVP management — plan future bowling sessions in advance."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_club_admin
from core.database import get_db
from core.push import push_to_regular_member
from models.evening import RegularMember, Evening, EveningPlayer
from models.schedule import ScheduledEvening, MemberRsvp, RsvpStatus, ScheduledEveningGuest
from models.user import User

router = APIRouter(prefix="/schedule", tags=["schedule"])


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
    return {
        "id": se.id,
        "date": se.date,
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
    ).order_by(ScheduledEvening.date).all()
    return [_serialize_scheduled_evening(se, user.regular_member_id) for se in items]


class ScheduledEveningCreate(BaseModel):
    date: str
    venue: Optional[str] = None
    note: Optional[str] = None


@router.post("/")
def create_scheduled_evening(
    data: ScheduledEveningCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = ScheduledEvening(club_id=user.club_id, created_by=user.id, **data.model_dump())
    db.add(se)
    db.commit()
    db.refresh(se)
    return _serialize_scheduled_evening(se, user.regular_member_id)


class ScheduledEveningUpdate(BaseModel):
    date: Optional[str] = None
    venue: Optional[str] = None
    note: Optional[str] = None


@router.patch("/{sid}")
def update_scheduled_evening(
    sid: int,
    data: ScheduledEveningUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    se = _get_se(sid, user.club_id, db)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(se, k, v)
    db.commit()
    db.refresh(se)
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
    import_attending: bool = True


@router.post("/{sid}/start")
def start_evening(
    sid: int,
    data: StartEveningBody,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """Create an actual Evening from a ScheduledEvening, optionally importing attending members and planned guests."""
    se = _get_se(sid, user.club_id, db)

    ev = Evening(
        club_id=se.club_id,
        date=se.date,
        venue=se.venue,
        note=se.note,
        scheduled_evening_id=se.id,
        created_by=user.id,
    )
    db.add(ev)
    db.flush()

    added_member_ids: set[int] = set()

    if data.import_attending:
        attending_ids = [r.regular_member_id for r in se.rsvps if r.status == RsvpStatus.attending]
        members = db.query(RegularMember).filter(RegularMember.id.in_(attending_ids)).all()
        for m in members:
            db.add(EveningPlayer(
                evening_id=ev.id,
                regular_member_id=m.id,
                name=m.nickname or m.name,
            ))
            added_member_ids.add(m.id)

    for guest in se.guests:
        # Skip if the guest is a known member already added via attending RSVP
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
    return {"id": ev.id, "date": ev.date, "venue": ev.venue}


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
    venue_str = f" ({se.venue})" if se.venue else ""
    for member in non_responders:
        push_to_regular_member(
            db, member.id,
            "🎳 Bist du dabei?",
            f"Kegelabend am {se.date}{venue_str} — bitte melde dich an oder ab.",
        )
    return {"reminded_count": len(non_responders)}

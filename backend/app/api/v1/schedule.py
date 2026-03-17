"""Scheduled evenings and RSVP management — plan future bowling sessions in advance."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_club_admin
from core.database import get_db
from core.push import push_to_regular_member
from models.evening import RegularMember
from models.schedule import ScheduledEvening, MemberRsvp, RsvpStatus
from models.user import User

router = APIRouter(prefix="/schedule", tags=["schedule"])


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
    }


# ── Scheduled Evening CRUD ──

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
    se = db.query(ScheduledEvening).filter(
        ScheduledEvening.id == sid, ScheduledEvening.club_id == user.club_id
    ).first()
    if not se:
        raise HTTPException(404, "Scheduled evening not found")
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
    se = db.query(ScheduledEvening).filter(
        ScheduledEvening.id == sid, ScheduledEvening.club_id == user.club_id
    ).first()
    if not se:
        raise HTTPException(404, "Scheduled evening not found")
    db.delete(se)
    db.commit()


# ── RSVP ──

class RsvpSet(BaseModel):
    status: str  # "attending" | "absent"


@router.post("/{sid}/rsvp")
def set_rsvp(
    sid: int,
    data: RsvpSet,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    """Set or update the calling user's RSVP for a scheduled evening.
    Members can set their own RSVP. Admins can set RSVP for any member by including regular_member_id."""
    if data.status not in (RsvpStatus.attending, RsvpStatus.absent):
        raise HTTPException(400, "Invalid status — use 'attending' or 'absent'")

    se = db.query(ScheduledEvening).filter(
        ScheduledEvening.id == sid, ScheduledEvening.club_id == user.club_id
    ).first()
    if not se:
        raise HTTPException(404, "Scheduled evening not found")

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
    """Admin: set RSVP for a specific regular member."""
    if data.status not in (RsvpStatus.attending, RsvpStatus.absent):
        raise HTTPException(400, "Invalid status")

    se = db.query(ScheduledEvening).filter(
        ScheduledEvening.id == sid, ScheduledEvening.club_id == user.club_id
    ).first()
    if not se:
        raise HTTPException(404, "Scheduled evening not found")

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
    """Remove the calling user's RSVP (back to no-response)."""
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
    """Admin: get all RSVPs and non-responders for a scheduled evening."""
    se = db.query(ScheduledEvening).filter(
        ScheduledEvening.id == sid, ScheduledEvening.club_id == user.club_id
    ).first()
    if not se:
        raise HTTPException(404, "Scheduled evening not found")

    # All active non-guest regular members
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
            "status": rsvp_map.get(m.id),  # None = no response
        }
        for m in all_members
    ]


@router.post("/{sid}/remind", status_code=200)
def send_reminder(
    sid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """Admin: send push notification reminder to all members who haven't RSVP'd yet."""
    se = db.query(ScheduledEvening).filter(
        ScheduledEvening.id == sid, ScheduledEvening.club_id == user.club_id
    ).first()
    if not se:
        raise HTTPException(404, "Scheduled evening not found")

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

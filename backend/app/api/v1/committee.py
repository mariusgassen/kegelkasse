"""Vergnügungsausschuss (Entertainment Committee) — trips and announcements."""
import logging
from datetime import UTC, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_committee_or_admin
from core.database import get_db
from core.push import push_to_club
from models.committee import ClubAnnouncement, ClubTrip
from models.evening import RegularMember
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/committee", tags=["committee"])


def _serialize_announcement(a: ClubAnnouncement, creator_name: Optional[str]) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "text": a.text,
        "media_url": a.media_url,
        "created_by_name": creator_name,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _serialize_trip(t: ClubTrip, creator_name: Optional[str]) -> dict:
    dt_utc = t.date.astimezone(UTC) if t.date.tzinfo else t.date.replace(tzinfo=UTC)
    return {
        "id": t.id,
        "date": dt_utc.strftime('%Y-%m-%dT%H:%M'),
        "destination": t.destination,
        "note": t.note,
        "created_by_name": creator_name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _creator_name(user_id: Optional[int], db: Session) -> Optional[str]:
    if not user_id:
        return None
    from models.user import User as UserModel
    u = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not u:
        return None
    # Prefer Kegelname (nickname) of linked regular member
    if u.regular_member_id:
        rm = db.query(RegularMember).filter(RegularMember.id == u.regular_member_id).first()
        if rm:
            return rm.nickname or rm.name
    return u.name


# ── Announcements ─────────────────────────────────────────────────────────────

@router.get("/announcements")
def list_announcements(
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    items = db.query(ClubAnnouncement).filter(
        ClubAnnouncement.club_id == user.club_id,
        ClubAnnouncement.is_deleted == False,
    ).order_by(ClubAnnouncement.created_at.desc()).all()
    return [_serialize_announcement(a, _creator_name(a.created_by, db)) for a in items]


class AnnouncementCreate(BaseModel):
    title: str
    text: Optional[str] = None
    media_url: Optional[str] = None


@router.post("/announcements")
def create_announcement(
    data: AnnouncementCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_committee_or_admin),
):
    ann = ClubAnnouncement(
        club_id=user.club_id,
        title=data.title.strip(),
        text=data.text.strip() if data.text else None,
        media_url=data.media_url or None,
        created_by=user.id,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    logger.info("Announcement created: id=%d club=%d user=%d title=%r", ann.id, user.club_id, user.id, ann.title)
    author = _creator_name(user.id, db)
    push_body = data.text.strip()[:120] if data.text else data.title.strip()
    background_tasks.add_task(
        push_to_club,
        db,
        user.club_id,
        f"📣 {data.title.strip()}",
        push_body,
        f"/#committee:announcements?item={ann.id}",
        # No category — announcements are always delivered, not filterable
    )
    return _serialize_announcement(ann, author)


@router.delete("/announcements/{aid}", status_code=204)
def delete_announcement(
    aid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_committee_or_admin),
):
    ann = db.query(ClubAnnouncement).filter(
        ClubAnnouncement.id == aid,
        ClubAnnouncement.club_id == user.club_id,
        ClubAnnouncement.is_deleted == False,
    ).first()
    if not ann:
        raise HTTPException(404, "Announcement not found")
    ann.is_deleted = True
    db.commit()
    logger.info("Announcement deleted: id=%d club=%d user=%d", aid, user.club_id, user.id)


# ── Trips (Kegelfahrt) ────────────────────────────────────────────────────────

@router.get("/trips")
def list_trips(
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    items = db.query(ClubTrip).filter(
        ClubTrip.club_id == user.club_id,
        ClubTrip.is_deleted == False,
    ).order_by(ClubTrip.date).all()
    return [_serialize_trip(t, _creator_name(t.created_by, db)) for t in items]


class TripCreate(BaseModel):
    date: str
    destination: str
    note: Optional[str] = None


def _parse_trip_date(date_str: str) -> datetime:
    for fmt in ('%Y-%m-%dT%H:%M', '%Y-%m-%d'):
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.replace(tzinfo=UTC)
        except ValueError:
            pass
    raise HTTPException(400, "Invalid date format — use YYYY-MM-DDTHH:MM or YYYY-MM-DD")


@router.post("/trips")
def create_trip(
    data: TripCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_committee_or_admin),
):
    dt = _parse_trip_date(data.date)
    trip = ClubTrip(
        club_id=user.club_id,
        date=dt,
        destination=data.destination.strip(),
        note=data.note.strip() if data.note else None,
        created_by=user.id,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    logger.info("Trip created: id=%d club=%d user=%d destination=%r", trip.id, user.club_id, user.id, trip.destination)
    date_str = dt.strftime('%d.%m.%Y')
    background_tasks.add_task(
        push_to_club,
        db,
        user.club_id,
        "🚌 Neue Kegelfahrt",
        f"Kegelfahrt am {date_str} nach {data.destination.strip()}",
        f"/#committee:trips?item={trip.id}",
        category="committee",
    )
    return _serialize_trip(trip, _creator_name(user.id, db))


class TripUpdate(BaseModel):
    date: Optional[str] = None
    destination: Optional[str] = None
    note: Optional[str] = None


@router.patch("/trips/{tid}")
def update_trip(
    tid: int,
    data: TripUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_committee_or_admin),
):
    trip = db.query(ClubTrip).filter(
        ClubTrip.id == tid,
        ClubTrip.club_id == user.club_id,
        ClubTrip.is_deleted == False,
    ).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    if data.date is not None:
        trip.date = _parse_trip_date(data.date)
    if data.destination is not None:
        trip.destination = data.destination.strip()
    if data.note is not None:
        trip.note = data.note.strip() or None
    db.commit()
    db.refresh(trip)
    return _serialize_trip(trip, _creator_name(trip.created_by, db))


@router.delete("/trips/{tid}", status_code=204)
def delete_trip(
    tid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_committee_or_admin),
):
    trip = db.query(ClubTrip).filter(
        ClubTrip.id == tid,
        ClubTrip.club_id == user.club_id,
        ClubTrip.is_deleted == False,
    ).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    trip.is_deleted = True
    db.commit()
    logger.info("Trip deleted: id=%d club=%d user=%d", tid, user.club_id, user.id)


# ── Committee members (read — for display; management via club.py) ─────────────

@router.get("/members")
def list_committee_members(
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    members = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_committee == True,
        RegularMember.is_active == True,
    ).all()
    return [
        {
            "id": m.id,
            "name": m.name,
            "nickname": m.nickname,
        }
        for m in members
    ]

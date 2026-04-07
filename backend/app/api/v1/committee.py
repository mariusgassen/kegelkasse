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
from models.committee import ClubAnnouncement, ClubTrip, ClubPoll, PollOption, PollVote
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


# ── Polls ─────────────────────────────────────────────────────────────────────

def _serialize_poll(poll: ClubPoll, options: list, my_vote_ids: set, creator_name: Optional[str]) -> dict:
    return {
        "id": poll.id,
        "title": poll.title,
        "text": poll.text,
        "mode": poll.mode,
        "is_closed": poll.is_closed,
        "created_by_name": creator_name,
        "created_at": poll.created_at.isoformat() if poll.created_at else None,
        "options": [
            {
                "id": o.id,
                "text": o.text,
                "sort_order": o.sort_order,
                "vote_count": o.vote_count,
                "voted_by_me": o.id in my_vote_ids,
            }
            for o in options
        ],
    }


def _get_poll_options_with_counts(poll_id: int, db: Session) -> list:
    """Return PollOption rows annotated with vote_count."""
    from sqlalchemy import func as sqlfunc
    opts = db.query(PollOption).filter(PollOption.poll_id == poll_id).order_by(PollOption.sort_order).all()
    counts = {
        row.option_id: row.cnt
        for row in db.query(PollVote.option_id, sqlfunc.count(PollVote.id).label("cnt"))
        .filter(PollVote.poll_id == poll_id)
        .group_by(PollVote.option_id)
        .all()
    }
    for o in opts:
        o.vote_count = counts.get(o.id, 0)
    return opts


@router.get("/polls")
def list_polls(
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    polls = db.query(ClubPoll).filter(
        ClubPoll.club_id == user.club_id,
        ClubPoll.is_deleted == False,
    ).order_by(ClubPoll.created_at.desc()).all()

    my_votes_by_poll: dict[int, set] = {}
    all_poll_ids = [p.id for p in polls]
    if all_poll_ids:
        votes = db.query(PollVote).filter(
            PollVote.poll_id.in_(all_poll_ids),
            PollVote.user_id == user.id,
        ).all()
        for v in votes:
            my_votes_by_poll.setdefault(v.poll_id, set()).add(v.option_id)

    result = []
    for poll in polls:
        opts = _get_poll_options_with_counts(poll.id, db)
        result.append(_serialize_poll(poll, opts, my_votes_by_poll.get(poll.id, set()), _creator_name(poll.created_by, db)))
    return result


class PollCreate(BaseModel):
    title: str
    text: Optional[str] = None
    mode: str = "single"  # 'single' | 'multi'
    options: list[str]


@router.post("/polls")
def create_poll(
    data: PollCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_committee_or_admin),
):
    if data.mode not in ("single", "multi"):
        raise HTTPException(400, "mode must be 'single' or 'multi'")
    if len(data.options) < 2:
        raise HTTPException(400, "A poll needs at least 2 options")
    poll = ClubPoll(
        club_id=user.club_id,
        title=data.title.strip(),
        text=data.text.strip() if data.text else None,
        mode=data.mode,
        created_by=user.id,
    )
    db.add(poll)
    db.flush()
    for i, opt_text in enumerate(data.options):
        opt_text = opt_text.strip()
        if not opt_text:
            raise HTTPException(400, "Option text must not be empty")
        db.add(PollOption(poll_id=poll.id, text=opt_text, sort_order=i))
    db.commit()
    db.refresh(poll)
    logger.info("Poll created: id=%d club=%d user=%d title=%r mode=%s", poll.id, user.club_id, user.id, poll.title, poll.mode)
    opts = _get_poll_options_with_counts(poll.id, db)
    return _serialize_poll(poll, opts, set(), _creator_name(user.id, db))


class PollUpdate(BaseModel):
    is_closed: Optional[bool] = None


@router.patch("/polls/{pid}")
def update_poll(
    pid: int,
    data: PollUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_committee_or_admin),
):
    poll = db.query(ClubPoll).filter(
        ClubPoll.id == pid,
        ClubPoll.club_id == user.club_id,
        ClubPoll.is_deleted == False,
    ).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
    if data.is_closed is not None:
        poll.is_closed = data.is_closed
    db.commit()
    db.refresh(poll)
    opts = _get_poll_options_with_counts(poll.id, db)
    my_votes = {v.option_id for v in db.query(PollVote).filter(PollVote.poll_id == pid, PollVote.user_id == user.id).all()}
    return _serialize_poll(poll, opts, my_votes, _creator_name(poll.created_by, db))


@router.delete("/polls/{pid}", status_code=204)
def delete_poll(
    pid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_committee_or_admin),
):
    poll = db.query(ClubPoll).filter(
        ClubPoll.id == pid,
        ClubPoll.club_id == user.club_id,
        ClubPoll.is_deleted == False,
    ).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
    poll.is_deleted = True
    db.commit()
    logger.info("Poll deleted: id=%d club=%d user=%d", pid, user.club_id, user.id)


class PollVoteCreate(BaseModel):
    option_ids: list[int]


@router.post("/polls/{pid}/vote", status_code=204)
def cast_vote(
    pid: int,
    data: PollVoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    poll = db.query(ClubPoll).filter(
        ClubPoll.id == pid,
        ClubPoll.club_id == user.club_id,
        ClubPoll.is_deleted == False,
    ).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
    if poll.is_closed:
        raise HTTPException(400, "Poll is closed")
    if not data.option_ids:
        raise HTTPException(400, "No options provided")
    if poll.mode == "single" and len(data.option_ids) > 1:
        raise HTTPException(400, "Single-answer poll accepts only one option")

    # Verify all options belong to this poll
    valid_ids = {o.id for o in db.query(PollOption).filter(PollOption.poll_id == pid).all()}
    for oid in data.option_ids:
        if oid not in valid_ids:
            raise HTTPException(400, f"Option {oid} does not belong to this poll")

    # Delete existing votes for this user on this poll, then re-insert
    db.query(PollVote).filter(PollVote.poll_id == pid, PollVote.user_id == user.id).delete()
    for oid in data.option_ids:
        db.add(PollVote(poll_id=pid, option_id=oid, user_id=user.id))
    db.commit()
    logger.info("Vote cast: poll=%d user=%d options=%s", pid, user.id, data.option_ids)


@router.delete("/polls/{pid}/vote", status_code=204)
def retract_vote(
    pid: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    poll = db.query(ClubPoll).filter(
        ClubPoll.id == pid,
        ClubPoll.club_id == user.club_id,
        ClubPoll.is_deleted == False,
    ).first()
    if not poll:
        raise HTTPException(404, "Poll not found")
    if poll.is_closed:
        raise HTTPException(400, "Poll is closed")
    db.query(PollVote).filter(PollVote.poll_id == pid, PollVote.user_id == user.id).delete()
    db.commit()
    logger.info("Vote retracted: poll=%d user=%d", pid, user.id)


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

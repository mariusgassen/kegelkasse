"""Guest requests — interested non-members ask to join a scheduled evening as a guest.

Requests come in through the public API (``api/v1/public.py``, used by the club website).
Every club member sees the overview and may approve or reject; approval adds the requester as a
planned guest of the evening. The requester is informed by email about the decision.
"""
import logging
from datetime import datetime, UTC
from typing import Optional

from babel.dates import format_datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from core.email import build_email_bodies, email_theme, get_club_email_config, send_club_email
from core.i18n import t
from core.push import push_to_club
from models.club import Club
from models.schedule import GuestRequest, GuestRequestStatus, ScheduledEvening, ScheduledEveningGuest
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/guest-requests", tags=["guest-requests"])

# Requesters have no account and no locale — their mails are German, like the club website.
GUEST_LOCALE = "de"
# Deep link for members (legacy hash form, translated by the frontend router like every push URL).
OVERVIEW_URL = "/#schedule?requests=1"


def _wall(dt: datetime) -> datetime:
    """Scheduled times are stored as club wall-clock time (core/clubtime.py) — format them as-is."""
    return dt.replace(tzinfo=None)


def _date_short(se: ScheduledEvening) -> str:
    return _wall(se.scheduled_at).strftime("%d.%m.%Y")


def _when_long(se: ScheduledEvening) -> str:
    return format_datetime(_wall(se.scheduled_at), "EEEE, d. MMMM y 'um' HH:mm 'Uhr'", locale=GUEST_LOCALE)


def serialize_request(r: GuestRequest) -> dict:
    se = r.scheduled_evening
    return {
        "id": r.id,
        "name": r.name,
        "email": r.email,
        "message": r.message,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "decided_at": r.decided_at.isoformat() if r.decided_at else None,
        "scheduled_evening_id": r.scheduled_evening_id,
        # Same wall-clock format as the schedule endpoints (YYYY-MM-DDTHH:MM).
        "scheduled_at": _wall(se.scheduled_at).strftime("%Y-%m-%dT%H:%M") if se else None,
        "venue": se.venue if se else None,
        "evening_cancelled": bool(se and se.is_deleted),
    }


def notify_members_of_request(db: Session, request_id: int) -> None:
    """Tell every member about a new request (category ``guest_requests``, email by default).

    Takes an id, not the object: it runs as a background task after the request's session closed.
    """
    req = db.query(GuestRequest).filter(GuestRequest.id == request_id).first()
    if not req:
        return
    se = req.scheduled_evening
    push_to_club(
        db, req.club_id,
        t(GUEST_LOCALE, "guest_request.notify.title"),
        t(GUEST_LOCALE, "guest_request.notify.body", name=req.name, date=_date_short(se)),
        OVERVIEW_URL,
        category="guest_requests",
    )


def _mail_requester(db: Session, req: GuestRequest) -> bool:
    """Inform the requester about the decision. Returns False when no mail could be sent."""
    club = db.query(Club).filter(Club.id == req.club_id).first()
    cfg = get_club_email_config(club) if club else None
    if not cfg:
        return False
    se = req.scheduled_evening
    kind = "approved" if req.status == GuestRequestStatus.approved else "rejected"
    subject = t(GUEST_LOCALE, f"guest_request.{kind}.subject", date=_date_short(se))
    venue = t(GUEST_LOCALE, "guest_request.venue", venue=se.venue) if se.venue else ""
    body = t(GUEST_LOCALE, f"guest_request.{kind}.body", name=req.name, when=_when_long(se),
             venue=venue, club=club.name)
    try:
        # No action link: the requester has no account in the app.
        text, html = build_email_bodies(subject, body, "", theme=email_theme(club), locale=GUEST_LOCALE)
        send_club_email(cfg, req.email, subject, text, html)
        return True
    except Exception as exc:  # noqa: BLE001 — the decision is saved either way
        logger.warning("Guest request mail failed for request %s: %s", req.id, exc, exc_info=True)
        return False


def _get_request(rid: int, user: User, db: Session) -> GuestRequest:
    req = db.query(GuestRequest).filter(GuestRequest.id == rid, GuestRequest.club_id == user.club_id).first()
    if not req:
        raise HTTPException(404, "Guest request not found")
    if req.status != GuestRequestStatus.pending:
        raise HTTPException(400, "Guest request already decided")
    return req


def _decide(req: GuestRequest, status: GuestRequestStatus, user: User, db: Session) -> dict:
    req.status = status.value
    req.decided_at = datetime.now(UTC)
    req.decided_by = user.id
    db.commit()
    db.refresh(req)
    logger.info("Guest request %s %s by user_id=%s", req.id, status.value, user.id)
    return {**serialize_request(req), "guest_notified": _mail_requester(db, req)}


@router.get("/")
def list_guest_requests(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """All requests of the club: pending first (oldest first), then decided (newest first)."""
    items = db.query(GuestRequest).filter(GuestRequest.club_id == user.club_id).all()
    pending = sorted((r for r in items if r.status == GuestRequestStatus.pending),
                     key=lambda r: r.created_at or datetime.min.replace(tzinfo=UTC))
    decided = sorted((r for r in items if r.status != GuestRequestStatus.pending),
                     key=lambda r: r.decided_at or r.created_at, reverse=True)
    return [serialize_request(r) for r in pending + decided]


@router.post("/{rid}/approve")
def approve_guest_request(rid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Approve: add the requester as a planned guest of the evening and mail them."""
    req = _get_request(rid, user, db)
    if req.scheduled_evening.is_deleted:
        raise HTTPException(400, "Scheduled evening was cancelled")
    guest = ScheduledEveningGuest(scheduled_evening_id=req.scheduled_evening_id, name=req.name)
    db.add(guest)
    db.flush()
    req.guest_id = guest.id
    return _decide(req, GuestRequestStatus.approved, user, db)


@router.post("/{rid}/reject")
def reject_guest_request(rid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Reject the request and mail the requester."""
    return _decide(_get_request(rid, user, db), GuestRequestStatus.rejected, user, db)


def find_open_duplicate(db: Session, se_id: int, email: str) -> Optional[GuestRequest]:
    """A pending or approved request with the same email for the same evening, if any."""
    return db.query(GuestRequest).filter(
        GuestRequest.scheduled_evening_id == se_id,
        GuestRequest.email == email,
        GuestRequest.status.in_([GuestRequestStatus.pending.value, GuestRequestStatus.approved.value]),
    ).first()

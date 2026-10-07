"""
Public, unauthenticated read API — for embedding club data on an external website.

Unlike the iCal feed and the TV scoreboard, there is no secret token here: the club is addressed
by its slug, so the data must be safe for anyone to read. That is enforced in two ways:

* **Opt-in per club.** Nothing is served unless an admin enabled `public_schedule_enabled` in the
  club settings. A club that hasn't opted in answers exactly like a club that doesn't exist (404),
  so slugs can't be probed.
* **Purpose-built projection.** Start time, venue, note and an attendance *count* of upcoming,
  non-cancelled evenings. No names, no individual RSVPs, no member data.

The one write endpoint lets interested people ask to join an evening as a guest. Since it triggers
mails to every member, it is guarded by a honeypot field, per-IP and per-email rate limits and
duplicate detection; it never mails the submitted address itself (no mail relay).
"""
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from pydantic import Field
from sqlalchemy.orm import Session

from api.v1.guest_requests import find_open_duplicate, notify_members_of_request
from core.clubtime import wall_now, wall_to_utc
from core.database import get_db
from core.ratelimit import SlidingWindowLimiter, client_ip
from core.schemas import TrimmedModel
from models.club import Club, ClubSettings
from models.evening import RegularMember
from models.schedule import GuestRequest, RsvpStatus, ScheduledEvening

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public", tags=["public"])

# Browsers and the homepage's CDN may cache the response — schedule changes are rare, and this
# keeps an unauthenticated endpoint from turning every page view into a DB query.
CACHE_SECONDS = 300

_request_limiter = SlidingWindowLimiter(window_seconds=3600)
_MAX_REQUESTS_PER_IP = 5
_MAX_REQUESTS_PER_EMAIL = 3
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _resolve_public_club(slug: str, db: Session) -> Club:
    club = db.query(Club).filter(Club.slug == slug).first()
    if club:
        s = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
        extra = (s.extra or {}) if s else {}
        if isinstance(extra, str):
            extra = json.loads(extra)
        if extra.get("public_schedule_enabled") is True:
            return club
    raise HTTPException(404, "Club not found")


def _attendance(se: ScheduledEvening, roster_ids: set[int]) -> tuple[int, int]:
    """(members, guests) expected at an evening — the same model as the in-app RSVP sheet.

    Attendance is opt-out: every active roster member counts as attending unless they declined.
    Planned guests come on top; a guest entry that points at a roster member already counted
    is not counted twice.
    """
    absent = {r.regular_member_id for r in se.rsvps if r.status == RsvpStatus.absent}
    members = len(roster_ids - absent)
    guests = sum(1 for g in se.guests if g.regular_member_id not in roster_ids)
    return members, guests


def _upcoming(club: Club, db: Session):
    return db.query(ScheduledEvening).filter(
        ScheduledEvening.club_id == club.id,
        ScheduledEvening.is_deleted == False,  # noqa: E712
        # Stored values are club wall-clock times (core/clubtime.py), so compare
        # against the wall clock, not against the UTC instant.
        ScheduledEvening.scheduled_at >= wall_now(),
    )


def _roster_ids(club: Club, db: Session) -> set[int]:
    return {mid for (mid,) in db.query(RegularMember.id).filter(
        RegularMember.club_id == club.id,
        RegularMember.is_active == True,  # noqa: E712
        RegularMember.is_guest == False,  # noqa: E712
        RegularMember.deactivated_at.is_(None),
    )}


def _serialize(se: ScheduledEvening, roster_ids: set[int]) -> dict:
    members, guests = _attendance(se, roster_ids)
    return {
        "id": se.id,
        "scheduled_at": wall_to_utc(se.scheduled_at).isoformat().replace("+00:00", "Z"),
        "venue": se.venue,
        "note": se.note,
        "attendees": {"members": members, "guests": guests, "total": members + guests},
        "guest_requests_enabled": bool(se.guest_requests_enabled),
    }


def _public_headers(response: Response) -> None:
    response.headers["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
    # Read-only public data: any website may fetch it directly from the browser. Plain GET without
    # custom headers needs no preflight, so this header alone is enough (the global CORS middleware
    # stays locked down for the rest of the API).
    response.headers["Access-Control-Allow-Origin"] = "*"


@router.get("/clubs/{slug}/schedule")
def public_schedule(
    slug: str,
    response: Response,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Upcoming scheduled evenings of a club that has opted in to a public schedule."""
    club = _resolve_public_club(slug, db)
    evenings = _upcoming(club, db).order_by(ScheduledEvening.scheduled_at).limit(limit).all()
    roster_ids = _roster_ids(club, db)
    _public_headers(response)
    return {"club": club.name, "evenings": [_serialize(se, roster_ids) for se in evenings]}


def _get_upcoming(slug: str, sid: int, db: Session) -> tuple[Club, ScheduledEvening]:
    club = _resolve_public_club(slug, db)
    se = _upcoming(club, db).filter(ScheduledEvening.id == sid).first()
    if not se:
        raise HTTPException(404, "Scheduled evening not found")
    return club, se


@router.get("/clubs/{slug}/schedule/{sid}")
def public_scheduled_evening(slug: str, sid: int, response: Response, db: Session = Depends(get_db)):
    """A single upcoming evening — for the guest-request page, which is linked by evening id."""
    club, se = _get_upcoming(slug, sid, db)
    _public_headers(response)
    return {"club": club.name, "evening": _serialize(se, _roster_ids(club, db))}


class GuestRequestCreate(TrimmedModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    message: Optional[str] = Field(default=None, max_length=1000)
    # Honeypot: hidden from people by the website, filled in by naive bots.
    website: Optional[str] = None


@router.post("/clubs/{slug}/schedule/{sid}/guest-requests", status_code=202)
def create_guest_request(slug: str, sid: int, data: GuestRequestCreate, request: Request,
                         background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Ask to join an upcoming evening as a guest. Members are notified; the answer comes by mail.

    Bots (honeypot), rate-limited senders and repeated requests get the same success response as
    a real request, so the endpoint can't be probed — they just don't create anything.
    """
    club, se = _get_upcoming(slug, sid, db)
    if not se.guest_requests_enabled:
        raise HTTPException(404, "Guest requests are not enabled for this evening")
    email = data.email.lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(422, "Invalid email address")
    accepted = {"ok": True}
    if data.website:
        logger.info("Guest request honeypot triggered for evening %s", sid)
        return accepted
    ip = client_ip(request)
    if (_request_limiter.hit(f"ip:{ip}", _MAX_REQUESTS_PER_IP)
            or _request_limiter.hit(f"email:{email}", _MAX_REQUESTS_PER_EMAIL)):
        logger.warning("Guest request rate-limited (evening %s)", sid)
        return accepted
    if find_open_duplicate(db, se.id, email):
        return accepted
    req = GuestRequest(club_id=club.id, scheduled_evening_id=se.id, name=data.name, email=email,
                       message=data.message or None)
    db.add(req)
    db.commit()
    db.refresh(req)
    logger.info("Guest request %s created for evening %s", req.id, se.id)
    background_tasks.add_task(notify_members_of_request, db, req.id)
    return accepted

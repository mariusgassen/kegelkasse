"""
Public, unauthenticated read API — for embedding club data on an external website.

Unlike the iCal feed and the TV scoreboard, there is no secret token here: the club is addressed
by its slug, so the data must be safe for anyone to read. That is enforced in two ways:

* **Opt-in per club.** Nothing is served unless an admin enabled `public_schedule_enabled` in the
  club settings. A club that hasn't opted in answers exactly like a club that doesn't exist (404),
  so slugs can't be probed.
* **Purpose-built projection.** Start time, venue, note and an attendance *count* of upcoming,
  non-cancelled evenings. No names, no individual RSVPs, no member data.
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from core.clubtime import wall_now, wall_to_utc
from core.database import get_db
from models.club import Club, ClubSettings
from models.evening import RegularMember
from models.schedule import RsvpStatus, ScheduledEvening

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public", tags=["public"])

# Browsers and the homepage's CDN may cache the response — schedule changes are rare, and this
# keeps an unauthenticated endpoint from turning every page view into a DB query.
CACHE_SECONDS = 300


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


@router.get("/clubs/{slug}/schedule")
def public_schedule(
    slug: str,
    response: Response,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Upcoming scheduled evenings of a club that has opted in to a public schedule."""
    club = _resolve_public_club(slug, db)
    evenings = (db.query(ScheduledEvening)
                .filter(ScheduledEvening.club_id == club.id,
                        ScheduledEvening.is_deleted == False,  # noqa: E712
                        # Stored values are club wall-clock times (core/clubtime.py), so compare
                        # against the wall clock, not against the UTC instant.
                        ScheduledEvening.scheduled_at >= wall_now())
                .order_by(ScheduledEvening.scheduled_at)
                .limit(limit)
                .all())
    roster_ids = {mid for (mid,) in db.query(RegularMember.id).filter(
        RegularMember.club_id == club.id,
        RegularMember.is_active == True,  # noqa: E712
        RegularMember.is_guest == False,  # noqa: E712
        RegularMember.deactivated_at.is_(None),
    )}

    response.headers["Cache-Control"] = f"public, max-age={CACHE_SECONDS}"
    # Read-only public data: any website may fetch it directly from the browser. Plain GET without
    # custom headers needs no preflight, so this header alone is enough (the global CORS middleware
    # stays locked down for the rest of the API).
    response.headers["Access-Control-Allow-Origin"] = "*"

    items = []
    for se in evenings:
        members, guests = _attendance(se, roster_ids)
        items.append({
            "id": se.id,
            "scheduled_at": wall_to_utc(se.scheduled_at).isoformat().replace("+00:00", "Z"),
            "venue": se.venue,
            "note": se.note,
            "attendees": {"members": members, "guests": guests, "total": members + guests},
        })
    return {"club": club.name, "evenings": items}

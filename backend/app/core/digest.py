"""Personalized email digest — periodic per-user summary of club activity.

Sent by the daily scheduler to users who opted into a digest frequency
(off / daily / weekly / monthly) whose club has email configured.  A digest
bundles, per recipient:

- the changes since their last digest: evenings added/changed, their own
  penalties and bookings, and community news (comments & reactions), and
- a personal account & balance overview,

with a deep link on every entry.  Empty digests (no changes since last time)
are skipped so members are never emailed noise.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from core.email import (build_digest_email, email_theme, get_club_email_config,
                        send_club_email)
from core.i18n import format_date, format_money, normalize_locale, t
from models.club import Club
from models.comment import Comment, ItemReaction
from models.evening import Evening, EveningPlayer, RegularMember
from models.payment import MemberPayment
from models.penalty import PenaltyLog
from models.user import User

logger = logging.getLogger(__name__)

VALID_FREQUENCIES = ("off", "daily", "weekly", "monthly")
FREQUENCY_INTERVALS = {
    "daily": timedelta(days=1),
    "weekly": timedelta(weeks=1),
    "monthly": timedelta(days=30),
}
# Window for a user's very first digest (no last_digest_at recorded yet).
FIRST_DIGEST_LOOKBACK = timedelta(days=30)
# Cap per section so a long-idle recipient never gets an unwieldy email.
MAX_ROWS = 15


def _penalty_euro(log: PenaltyLog) -> float:
    if log.mode == "euro":
        return log.amount
    if log.unit_amount is not None:
        return log.amount * log.unit_amount
    return 0.0


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _snippet(text: str | None, limit: int = 80) -> str | None:
    """Short, single-line preview of a comment's text, or ``None`` for media-only comments."""
    s = (text or "").strip().replace("\n", " ")
    if not s:
        return None
    return s if len(s) <= limit else s[:limit - 1] + "…"


def get_digest_frequency(user: User) -> str:
    prefs = user.push_preferences or {}
    val = prefs.get("digest_frequency", "off")
    return val if val in VALID_FREQUENCIES else "off"


def is_digest_due(user: User, now: datetime) -> bool:
    """True if the user's chosen frequency has elapsed since their last digest."""
    freq = get_digest_frequency(user)
    if freq == "off":
        return False
    last = _aware(user.last_digest_at)
    if last is None:
        return True
    # Small tolerance so a daily job running a little early (e.g. 23h50m) still fires.
    return now - last >= FREQUENCY_INTERVALS[freq] - timedelta(hours=2)


def _member_player_ids(db: Session, club_id: int, member_id: int) -> list[int]:
    rows = (
        db.query(EveningPlayer.id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(Evening.club_id == club_id, EveningPlayer.regular_member_id == member_id)
        .all()
    )
    return [pid for (pid,) in rows]


def _member_account(db: Session, club_id: int, member_id: int) -> dict:
    """Return {balance, penalty_total, paid_total} (euros) for one member."""
    player_ids = _member_player_ids(db, club_id, member_id)
    penalty_total = 0.0
    if player_ids:
        for log in db.query(PenaltyLog).filter(
            PenaltyLog.player_id.in_(player_ids), PenaltyLog.is_deleted == False  # noqa: E712
        ).all():
            penalty_total += _penalty_euro(log)
    for log in (
        db.query(PenaltyLog)
        .join(Evening, Evening.id == PenaltyLog.evening_id)
        .filter(
            Evening.club_id == club_id,
            PenaltyLog.player_id.is_(None),
            PenaltyLog.regular_member_id == member_id,
            PenaltyLog.is_deleted == False,  # noqa: E712
        )
        .all()
    ):
        penalty_total += _penalty_euro(log)
    paid_total = 0.0
    for p in db.query(MemberPayment).filter(
        MemberPayment.club_id == club_id,
        MemberPayment.regular_member_id == member_id,
        MemberPayment.is_deleted == False,  # noqa: E712
    ).all():
        paid_total += p.amount
    return {
        "penalty_total": round(penalty_total, 2),
        "paid_total": round(paid_total, 2),
        "balance": round(paid_total - penalty_total, 2),
    }


def build_digest(db: Session, user: User, since: datetime | None, now: datetime,
                 locale: str | None = None) -> dict | None:
    """Assemble the personalized digest data for ``user``.

    Returns ``None`` when the user is not linked to a member, or when there is
    no fresh content to report since ``since`` (avoids empty emails).
    """
    if user.regular_member_id is None or user.club_id is None:
        return None
    member = db.query(RegularMember).filter(RegularMember.id == user.regular_member_id).first()
    if member is None:
        return None
    locale = normalize_locale(locale or user.preferred_locale)
    member_id = member.id
    club_id = user.club_id
    account_url = f"/#treasury:accounts?member={member_id}"

    # --- Changes since `since` (first digest: FIRST_DIGEST_LOOKBACK window) ---
    window_start = since or (now - FIRST_DIGEST_LOOKBACK)

    # Evenings added / closed / updated in the club.
    evenings: list[dict] = []
    for e in (
        db.query(Evening)
        .filter(Evening.club_id == club_id)
        .order_by(Evening.date.desc())
        .all()
    ):
        created = _aware(e.created_at)
        updated = _aware(e.updated_at)
        ended = _aware(e.ended_at)
        newest = max(d for d in (created, updated, ended) if d is not None) if any(
            d is not None for d in (created, updated, ended)) else None
        if newest is None or newest < window_start:
            continue
        if e.is_closed:
            status = t(locale, "digest.evening.closed")
        elif created and created >= window_start:
            status = t(locale, "digest.evening.new")
        else:
            status = t(locale, "digest.evening.updated")
        label = format_date(e.date, locale)
        if e.venue:
            label = f"{label} · {e.venue}"
        evenings.append({"label": label, "value": status, "url": f"/#schedule?evening={e.id}"})
        if len(evenings) >= MAX_ROWS:
            break

    # Personal penalties logged since the window start.
    player_ids = _member_player_ids(db, club_id, member_id)
    penalties: list[dict] = []
    pen_q = db.query(PenaltyLog).join(Evening, Evening.id == PenaltyLog.evening_id).filter(
        Evening.club_id == club_id,
        PenaltyLog.is_deleted == False,  # noqa: E712
        PenaltyLog.created_at >= window_start,
    )
    from sqlalchemy import or_
    conds = [PenaltyLog.regular_member_id == member_id]
    if player_ids:
        conds.append(PenaltyLog.player_id.in_(player_ids))
    for log in pen_q.filter(or_(*conds)).order_by(PenaltyLog.created_at.desc()).limit(MAX_ROWS).all():
        label = f"{log.icon or '⚠️'} {log.penalty_type_name}"
        penalties.append({
            "label": label,
            "value": format_money(_penalty_euro(log), locale),
            "url": account_url,
        })

    # Personal bookings (payments / credits / debits) recorded since the window start.
    bookings: list[dict] = []
    for p in (
        db.query(MemberPayment)
        .filter(
            MemberPayment.club_id == club_id,
            MemberPayment.regular_member_id == member_id,
            MemberPayment.is_deleted == False,  # noqa: E712
            MemberPayment.created_at >= window_start,
        )
        .order_by(MemberPayment.created_at.desc())
        .limit(MAX_ROWS)
        .all()
    ):
        label = p.note or format_date(p.date or p.created_at, locale)
        bookings.append({"label": label, "value": format_money(p.amount, locale), "url": account_url})

    # Community news: new comments + reactions on club items since the window start.
    community = _community_news(db, club_id, window_start, locale)

    has_content = bool(evenings or penalties or bookings or community)
    if not has_content:
        return None

    account = _member_account(db, club_id, member_id)
    account["url"] = account_url
    return {
        "member_name": member.nickname or member.name,
        "since": since,
        "balance": account,
        "evenings": evenings,
        "penalties": penalties,
        "bookings": bookings,
        "community": community,
        "has_content": has_content,
    }


_THREAD_ICON = {"announcement": "📣", "trip": "🚌", "highlight": "✨"}


def _community_news(db: Session, club_id: int, since: datetime, locale: str | None) -> list[dict]:
    """News threads (highlights/announcements/trips) with new activity since ``since``.

    Comments and reactions are grouped per parent item into one row per thread —
    rather than one row per event — showing how much happened and deep-linking
    straight to the newest activity in that thread.
    """
    from api.v1.comments import _parent_title, _parent_url

    member_user_ids = {row.id for row in db.query(User.id).filter(User.club_id == club_id).all()}
    if not member_user_ids:
        return []

    # (parent_type, parent_id) -> aggregate of new activity in that thread.
    threads: dict[tuple[str, int], dict] = {}

    def _touch(parent_type: str, parent_id: int, when: datetime, comment_id: int | None,
              is_comment: bool, text: str | None = None) -> None:
        key = (parent_type, parent_id)
        th = threads.setdefault(key, {
            "comments": 0, "reactions": 0, "latest": when,
            "latest_comment_id": None, "latest_snippet": None,
        })
        if is_comment:
            th["comments"] += 1
        else:
            th["reactions"] += 1
        if when >= th["latest"]:
            th["latest"] = when
            th["latest_comment_id"] = comment_id if is_comment else None
            th["latest_snippet"] = _snippet(text) if is_comment else None

    for c in (
        db.query(Comment)
        .filter(
            Comment.created_by.in_(member_user_ids),
            Comment.is_deleted == False,  # noqa: E712
            Comment.created_at >= since,
        )
        .all()
    ):
        _touch(c.parent_type, c.parent_id, _aware(c.created_at), c.id, True, c.text)

    for r in (
        db.query(ItemReaction)
        .filter(ItemReaction.user_id.in_(member_user_ids), ItemReaction.created_at >= since)
        .all()
    ):
        _touch(r.parent_type, r.parent_id, _aware(r.created_at), None, False)

    rows: list[tuple[datetime, dict]] = []
    for (parent_type, parent_id), th in threads.items():
        icon = _THREAD_ICON.get(parent_type, "💬")
        title = _parent_title(parent_type, parent_id, db) or t(locale, "digest.community.untitled")
        parts = []
        if th["comments"]:
            parts.append(f"💬 {th['comments']}")
        if th["reactions"]:
            parts.append(f"❤️ {th['reactions']}")
        rows.append((th["latest"], {
            "label": f"{icon} {title}",
            "value": " · ".join(parts),
            "url": _parent_url(parent_type, parent_id, th["latest_comment_id"]),
            "snippet": th["latest_snippet"],
        }))

    rows.sort(key=lambda x: x[0] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return [it for _, it in rows[:MAX_ROWS]]


def send_user_digest(db: Session, user: User, cfg: dict, now: datetime,
                     force: bool = False) -> bool:
    """Build and send one user's digest via the club SMTP. Returns True if sent.

    ``force`` bypasses the due check and the empty-digest skip (used by the
    self-service 'send test digest now' endpoint).
    """
    if not user.email:
        return False
    since = _aware(user.last_digest_at)
    data = build_digest(db, user, since, now, user.preferred_locale)
    if data is None:
        if not force:
            return False
        # Forced preview with no fresh content — still show the account overview.
        data = _empty_preview(db, user, now)
        if data is None:
            return False
    theme = email_theme(user.club)
    subject, text, html = build_digest_email(theme, data, user.preferred_locale)
    try:
        send_club_email(cfg, user.email, subject, text, html)
    except Exception as exc:  # noqa: BLE001 — never let one bad address break the loop
        logger.warning("Digest email failed for user %s: %s", user.id, exc, exc_info=True)
        return False
    user.last_digest_at = now
    db.commit()
    return True


def _empty_preview(db: Session, user: User, now: datetime) -> dict | None:
    """Account-only digest payload for a forced send when nothing changed."""
    if user.regular_member_id is None or user.club_id is None:
        return None
    member = db.query(RegularMember).filter(RegularMember.id == user.regular_member_id).first()
    if member is None:
        return None
    account = _member_account(db, user.club_id, member.id)
    account["url"] = f"/#treasury:accounts?member={member.id}"
    return {
        "member_name": member.nickname or member.name,
        "since": _aware(user.last_digest_at),
        "balance": account,
        "evenings": [], "penalties": [], "bookings": [], "community": [],
        "has_content": False,
    }


async def send_all_digests(db: Session, now: datetime | None = None) -> int:
    """Send digests to every due user whose club has email configured. Returns count sent."""
    now = now or datetime.now(timezone.utc)
    cfg_cache: dict[int, dict | None] = {}
    sent = 0
    users = db.query(User).filter(
        User.is_active == True,  # noqa: E712
        User.regular_member_id.isnot(None),
    ).all()
    for user in users:
        try:
            if not is_digest_due(user, now):
                continue
            if user.club_id not in cfg_cache:
                club = db.query(Club).filter(Club.id == user.club_id).first()
                cfg_cache[user.club_id] = get_club_email_config(club) if club else None
            cfg = cfg_cache[user.club_id]
            if cfg is None:
                continue
            if send_user_digest(db, user, cfg, now):
                sent += 1
        except Exception:
            logger.exception("Digest failed for user %s", user.id)
            db.rollback()
    logger.info("Digests sent: %d", sent)
    return sent

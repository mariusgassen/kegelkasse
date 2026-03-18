"""Automated reminder logic — runs daily via APScheduler."""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from core.push import _send_one, _user_wants, push_to_club_admins, push_to_regular_member
from models.club import Club
from models.evening import Evening, EveningPlayer, RegularMember
from models.payment import MemberPayment, PaymentRequest, PaymentRequestStatus
from models.penalty import PenaltyLog
from models.push import PushSubscription
from models.schedule import MemberRsvp, ScheduledEvening
from models.user import User

logger = logging.getLogger(__name__)

_DEFAULT_REMINDER_SETTINGS: dict = {
    "debt_weekly": {"enabled": False, "weekday": 1, "min_debt": 5.0},
    "upcoming_evening": {"enabled": False, "days_before": 5},
    "rsvp_reminder": {"enabled": False, "days_before": 3},
    "debt_day_of": {"enabled": False},
    "payment_request_nudge": {"enabled": False, "days_pending": 3},
}


def get_reminder_settings(club: Club) -> dict:
    extra = (club.settings.extra or {}) if club.settings else {}
    saved = extra.get("reminders", {})
    result = {}
    for key, defaults in _DEFAULT_REMINDER_SETTINGS.items():
        merged = dict(defaults)
        merged.update(saved.get(key, {}))
        result[key] = merged
    return result


def _penalty_euro(log: PenaltyLog) -> float:
    if log.mode == "euro":
        return log.amount
    if log.unit_amount is not None:
        return log.amount * log.unit_amount
    return 0.0


def _compute_balances(db: Session, club_id: int) -> dict[int, float]:
    """Return {regular_member_id: balance} for all active non-guest members."""
    members = db.query(RegularMember).filter(
        RegularMember.club_id == club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
    ).all()
    if not members:
        return {}

    member_ids = {m.id for m in members}

    player_rows = (
        db.query(EveningPlayer.id, EveningPlayer.regular_member_id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(Evening.club_id == club_id, EveningPlayer.regular_member_id.in_(member_ids))
        .all()
    )
    member_player_ids: dict[int, list[int]] = {}
    for pid, mid in player_rows:
        member_player_ids.setdefault(mid, []).append(pid)

    all_player_ids = [pid for ids in member_player_ids.values() for pid in ids]
    penalty_by_player: dict[int, float] = {}
    if all_player_ids:
        for log in db.query(PenaltyLog).filter(
            PenaltyLog.player_id.in_(all_player_ids), PenaltyLog.is_deleted == False
        ).all():
            penalty_by_player[log.player_id] = penalty_by_player.get(log.player_id, 0.0) + _penalty_euro(log)

    absence_by_member: dict[int, float] = {}
    for log in (
        db.query(PenaltyLog)
        .join(Evening, Evening.id == PenaltyLog.evening_id)
        .filter(
            Evening.club_id == club_id,
            PenaltyLog.player_id.is_(None),
            PenaltyLog.regular_member_id.in_(member_ids),
            PenaltyLog.is_deleted == False,
        )
        .all()
    ):
        absence_by_member[log.regular_member_id] = absence_by_member.get(log.regular_member_id, 0.0) + _penalty_euro(log)

    payments_by_member: dict[int, float] = {}
    for p in db.query(MemberPayment).filter(MemberPayment.club_id == club_id).all():
        payments_by_member[p.regular_member_id] = payments_by_member.get(p.regular_member_id, 0.0) + p.amount

    balances: dict[int, float] = {}
    for m in members:
        pids = member_player_ids.get(m.id, [])
        penalty_total = sum(penalty_by_player.get(pid, 0.0) for pid in pids)
        penalty_total += absence_by_member.get(m.id, 0.0)
        payments_total = payments_by_member.get(m.id, 0.0)
        balances[m.id] = round(payments_total - penalty_total, 2)
    return balances


def _member_name(member: RegularMember) -> str:
    return member.nickname or member.name


def _upcoming_evenings(db: Session, club_id: int, today: date) -> list[tuple[date, str | None]]:
    """Return [(event_date, venue)] for all scheduled evenings after today."""
    future = datetime.combine(today + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc)
    rows = db.query(ScheduledEvening).filter(
        ScheduledEvening.club_id == club_id,
        ScheduledEvening.scheduled_at >= future,
    ).all()
    return [(r.scheduled_at.date(), r.venue) for r in rows]


def send_debt_reminders(db: Session, club: Club, settings: dict, today: date) -> int:
    """Weekly debt reminder — fires on the configured weekday for members with outstanding debt."""
    cfg = settings.get("debt_weekly", {})
    if not cfg.get("enabled"):
        return 0
    weekday = int(cfg.get("weekday", 1))  # 0=Mon … 6=Sun (Python weekday)
    if today.weekday() != weekday:
        return 0

    min_debt = float(cfg.get("min_debt", 5.0))
    balances = _compute_balances(db, club.id)
    members = db.query(RegularMember).filter(
        RegularMember.club_id == club.id, RegularMember.is_active == True, RegularMember.is_guest == False
    ).all()

    sent = 0
    for m in members:
        balance = balances.get(m.id, 0.0)
        if balance < -min_debt:
            debt_str = f"{abs(balance):.2f}".replace('.', ',')
            push_to_regular_member(
                db, m.id,
                "💳 Offener Betrag",
                f"Du hast noch {debt_str}€ offen in der Vereinskasse.",
                f"/#treasury:accounts?member={m.id}&memberName={_member_name(m)}",
                category="reminder_debt",
            )
            sent += 1
    return sent


def send_upcoming_evening_reminders(db: Session, club: Club, settings: dict, today: date) -> int:
    """Upcoming evening reminder — each user can set their own days_before (default from club settings)."""
    cfg = settings.get("upcoming_evening", {})
    if not cfg.get("enabled"):
        return 0

    club_default_days = int(cfg.get("days_before", 5))
    upcoming = _upcoming_evenings(db, club.id, today)
    if not upcoming:
        return 0

    # Index upcoming evenings by date for O(1) lookup
    upcoming_by_date = {d: venue for d, venue in upcoming}

    users = db.query(User).filter(
        User.club_id == club.id,
        User.is_active == True,
        User.regular_member_id.isnot(None),
    ).all()

    sent = 0
    for user in users:
        if not _user_wants(user, "reminder_schedule"):
            continue
        prefs = user.push_preferences or {}
        days_before = int(prefs.get("reminder_schedule_days", club_default_days))
        target_date = today + timedelta(days=days_before)
        if target_date not in upcoming_by_date:
            continue
        venue = upcoming_by_date[target_date]
        date_str = target_date.strftime("%-d. %B")
        subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
        for sub in subs:
            _send_one(
                db, sub,
                "🎳 Kegeln in Kürze",
                f"Kegeln in {days_before} {'Tag' if days_before == 1 else 'Tagen'} ({date_str}){f' – {venue}' if venue else ''}",
                "/schedule",
            )
        if subs:
            sent += 1
    return sent


def send_rsvp_reminders(db: Session, club: Club, settings: dict, today: date) -> int:
    """RSVP reminder — push to members who haven't responded yet, N days before event."""
    cfg = settings.get("rsvp_reminder", {})
    if not cfg.get("enabled"):
        return 0

    days_before = int(cfg.get("days_before", 3))
    target_date = today + timedelta(days=days_before)

    upcoming = _upcoming_evenings(db, club.id, today)
    target_evenings = [d for d, _ in upcoming if d == target_date]
    if not target_evenings:
        return 0

    # Get IDs of evenings on the target date
    future = datetime.combine(today + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc)
    evenings = db.query(ScheduledEvening).filter(
        ScheduledEvening.club_id == club.id,
        ScheduledEvening.scheduled_at >= future,
    ).all()
    target_evening_ids = [e.id for e in evenings if e.scheduled_at.date() == target_date]

    members = db.query(RegularMember).filter(
        RegularMember.club_id == club.id, RegularMember.is_active == True, RegularMember.is_guest == False
    ).all()

    sent = 0
    date_str = target_date.strftime("%-d. %B")
    for eve_id in target_evening_ids:
        responded_ids = {r.regular_member_id for r in db.query(MemberRsvp).filter(
            MemberRsvp.scheduled_evening_id == eve_id
        ).all()}
        for m in members:
            if m.id not in responded_ids:
                push_to_regular_member(
                    db, m.id,
                    "🎳 Kegeln in Kürze – bist du dabei?",
                    f"Kegeln am {date_str}: Bitte jetzt abstimmen!",
                    "/schedule",
                    category="reminder_schedule",
                )
                sent += 1
    return sent


def send_debt_day_of_reminders(db: Session, club: Club, settings: dict, today: date) -> int:
    """Day-of debt reminder — push to debtors on the day of a scheduled evening."""
    cfg = settings.get("debt_day_of", {})
    if not cfg.get("enabled"):
        return 0

    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    has_evening_today = db.query(ScheduledEvening).filter(
        ScheduledEvening.club_id == club.id,
        ScheduledEvening.scheduled_at >= today_start,
        ScheduledEvening.scheduled_at < today_end,
    ).first() is not None
    if not has_evening_today:
        return 0

    balances = _compute_balances(db, club.id)
    members = db.query(RegularMember).filter(
        RegularMember.club_id == club.id, RegularMember.is_active == True, RegularMember.is_guest == False
    ).all()

    sent = 0
    for m in members:
        balance = balances.get(m.id, 0.0)
        if balance < -0.01:
            debt_str = f"{abs(balance):.2f}".replace('.', ',')
            push_to_regular_member(
                db, m.id,
                "🎳 Heute Kegeln – offener Betrag",
                f"Denk daran: Du hast noch {debt_str}€ in der Kasse offen.",
                f"/#treasury:accounts?member={m.id}&memberName={_member_name(m)}",
                category="reminder_debt",
            )
            sent += 1
    return sent


def send_payment_request_nudge(db: Session, club: Club, settings: dict, today: date) -> int:
    """Admin nudge — remind admins if payment requests have been pending too long."""
    cfg = settings.get("payment_request_nudge", {})
    if not cfg.get("enabled"):
        return 0

    days_pending = int(cfg.get("days_pending", 3))
    cutoff = datetime.combine(today - timedelta(days=days_pending), datetime.min.time()).replace(tzinfo=timezone.utc)

    pending = db.query(PaymentRequest).filter(
        PaymentRequest.club_id == club.id,
        PaymentRequest.status == PaymentRequestStatus.pending,
        PaymentRequest.created_at < cutoff,
    ).all()
    if not pending:
        return 0

    count = len(pending)
    push_to_club_admins(
        db, club.id,
        "💰 Zahlungsanfragen ausstehend",
        f"{count} Zahlungsanfrage{'n' if count != 1 else ''} warte{'n' if count != 1 else ''} auf Bestätigung.",
        "/#treasury:accounts",
        category="reminder_payments",
    )
    return count


async def send_all_reminders(db: Session) -> None:
    """Run all enabled reminder types for all clubs."""
    today = date.today()
    clubs = db.query(Club).all()
    for club in clubs:
        if not club.settings:
            continue
        cfg = get_reminder_settings(club)
        for fn_name, fn in [
            ("debt_reminders", send_debt_reminders),
            ("upcoming_evening", send_upcoming_evening_reminders),
            ("rsvp_reminders", send_rsvp_reminders),
            ("debt_day_of", send_debt_day_of_reminders),
            ("payment_nudge", send_payment_request_nudge),
        ]:
            try:
                n = fn(db, club, cfg, today)
                logger.debug("Club %s %s: sent=%d", club.id, fn_name, n)
            except Exception:
                logger.exception("%s failed for club %s", fn_name, club.id)

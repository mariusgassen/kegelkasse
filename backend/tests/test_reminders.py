"""
Tests for app/core/reminders.py

Covers:
- get_reminder_settings
- _penalty_euro
- _compute_balances
- send_debt_reminders
- send_upcoming_evening_reminders
- send_rsvp_reminders
- send_debt_day_of_reminders
- send_payment_request_nudge
- send_auto_report_reminder
- send_all_reminders
"""
import asyncio
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock, patch, AsyncMock

import pytest
from sqlalchemy.orm import Session

from core.security import get_password_hash
from models.club import Club, ClubSettings
from models.evening import Evening, EveningPlayer, RegularMember
from models.payment import MemberPayment, PaymentRequest, PaymentRequestStatus
from models.penalty import PenaltyLog, PenaltyMode
from models.push import PushSubscription
from models.schedule import MemberRsvp, ScheduledEvening
from models.user import User, UserRole

from core.reminders import (
    get_reminder_settings,
    _penalty_euro,
    _compute_balances,
    send_debt_reminders,
    send_upcoming_evening_reminders,
    send_rsvp_reminders,
    send_debt_day_of_reminders,
    send_payment_request_nudge,
    send_auto_report_reminder,
    send_all_reminders,
)


# ---------------------------------------------------------------------------
# Autouse cleanup fixture
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    """Delete all objects created by this module in reverse FK order."""
    yield
    db.query(MemberRsvp).delete(synchronize_session=False)
    db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).delete(synchronize_session=False)
    db.query(PaymentRequest).filter(PaymentRequest.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(PushSubscription).filter(
        PushSubscription.user_id.in_(
            db.query(User.id).filter(User.club_id == club.id)
        )
    ).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id, User.email.like("%reminder%")).delete(synchronize_session=False)
    # delete penalty logs tied to evenings of this club
    evening_ids = [r[0] for r in db.query(Evening.id).filter(Evening.club_id == club.id).all()]
    if evening_ids:
        db.query(PenaltyLog).filter(PenaltyLog.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id.in_(evening_ids)).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_member(db: Session, club: Club, name: str = "Alice", is_guest: bool = False) -> RegularMember:
    m = RegularMember(club_id=club.id, name=name, is_active=True, is_guest=is_guest)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def _make_club_settings(db: Session, club: Club, reminders: dict | None = None) -> ClubSettings:
    extra: dict = {}
    if reminders:
        extra["reminders"] = reminders
    s = ClubSettings(club_id=club.id, extra=extra)
    db.add(s)
    db.commit()
    db.refresh(s)
    # refresh the club's settings relationship
    db.refresh(club)
    return s


def _make_evening(db: Session, club: Club, user: User) -> Evening:
    e = Evening(
        club_id=club.id,
        date=datetime.now(timezone.utc),
        created_by=user.id,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _make_scheduled_evening(db: Session, club: Club, user: User, days_from_now: int = 5) -> ScheduledEvening:
    se = ScheduledEvening(
        club_id=club.id,
        scheduled_at=datetime.now(timezone.utc) + timedelta(days=days_from_now),
        created_by=user.id,
    )
    db.add(se)
    db.commit()
    db.refresh(se)
    return se


def _make_penalty_log(
    db: Session,
    evening: Evening,
    player: EveningPlayer | None,
    amount: float,
    mode: str = "euro",
    unit_amount: float | None = None,
    regular_member_id: int | None = None,
) -> PenaltyLog:
    log = PenaltyLog(
        evening_id=evening.id,
        player_id=player.id if player else None,
        player_name="Alice",
        penalty_type_name="Verspätet",
        amount=amount,
        mode=PenaltyMode(mode),
        unit_amount=unit_amount,
        regular_member_id=regular_member_id,
        created_by=evening.created_by,
        client_timestamp=0.0,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ---------------------------------------------------------------------------
# get_reminder_settings
# ---------------------------------------------------------------------------

class TestGetReminderSettings:
    def test_returns_defaults_when_no_settings(self, club: Club):
        """Without ClubSettings, returns all defaults."""
        result = get_reminder_settings(club)
        assert "debt_weekly" in result
        assert result["debt_weekly"]["enabled"] is False
        assert result["debt_weekly"]["weekday"] == 1
        assert result["debt_weekly"]["min_debt"] == 5.0

    def test_merges_saved_settings(self, db: Session, club: Club):
        """Saved settings override defaults; defaults for unset keys are preserved."""
        _make_club_settings(db, club, reminders={
            "debt_weekly": {"enabled": True, "weekday": 3},
        })
        result = get_reminder_settings(club)
        assert result["debt_weekly"]["enabled"] is True
        assert result["debt_weekly"]["weekday"] == 3
        assert result["debt_weekly"]["min_debt"] == 5.0  # default preserved
        assert result["upcoming_evening"]["enabled"] is False  # other key default

    def test_all_keys_present(self, db: Session, club: Club):
        _make_club_settings(db, club)
        result = get_reminder_settings(club)
        for key in ("debt_weekly", "upcoming_evening", "rsvp_reminder",
                    "debt_day_of", "payment_request_nudge", "auto_report"):
            assert key in result


# ---------------------------------------------------------------------------
# _penalty_euro
# ---------------------------------------------------------------------------

class TestPenaltyEuro:
    def _log(self, mode: str, amount: float, unit_amount: float | None = None) -> MagicMock:
        log = MagicMock(spec=PenaltyLog)
        log.mode = mode
        log.amount = amount
        log.unit_amount = unit_amount
        return log

    def test_euro_mode_returns_amount(self):
        log = self._log("euro", 2.5)
        assert _penalty_euro(log) == 2.5

    def test_count_mode_with_unit_amount(self):
        log = self._log("count", 3, unit_amount=0.5)
        assert _penalty_euro(log) == 1.5

    def test_count_mode_without_unit_amount_returns_zero(self):
        log = self._log("count", 3, unit_amount=None)
        assert _penalty_euro(log) == 0.0


# ---------------------------------------------------------------------------
# _compute_balances
# ---------------------------------------------------------------------------

class TestComputeBalances:
    def test_empty_when_no_members(self, db: Session, club: Club):
        result = _compute_balances(db, club.id)
        assert result == {}

    def test_zero_balance_no_activity(self, db: Session, club: Club):
        _make_member(db, club, "Alice")
        result = _compute_balances(db, club.id)
        assert all(v == 0.0 for v in result.values())

    def test_excludes_guests(self, db: Session, club: Club):
        guest = _make_member(db, club, "Guest", is_guest=True)
        result = _compute_balances(db, club.id)
        assert guest.id not in result

    def test_penalty_reduces_balance(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "Bob")
        evening = _make_evening(db, club, user)
        player = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name="Bob")
        db.add(player)
        db.commit()
        db.refresh(player)
        _make_penalty_log(db, evening, player, 1.50)
        result = _compute_balances(db, club.id)
        assert result[member.id] == -1.5

    def test_payment_increases_balance(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "Carol")
        payment = MemberPayment(
            club_id=club.id, regular_member_id=member.id, amount=10.0, created_by=user.id
        )
        db.add(payment)
        db.commit()
        result = _compute_balances(db, club.id)
        assert result[member.id] == 10.0

    def test_absence_penalty_via_regular_member_id(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "Dave")
        evening = _make_evening(db, club, user)
        _make_penalty_log(db, evening, None, 2.0, regular_member_id=member.id)
        result = _compute_balances(db, club.id)
        assert result[member.id] == -2.0

    def test_soft_deleted_penalty_ignored(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "Eve")
        evening = _make_evening(db, club, user)
        player = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name="Eve")
        db.add(player)
        db.commit()
        db.refresh(player)
        log = _make_penalty_log(db, evening, player, 5.0)
        log.is_deleted = True
        db.commit()
        result = _compute_balances(db, club.id)
        assert result[member.id] == 0.0


# ---------------------------------------------------------------------------
# send_debt_reminders
# ---------------------------------------------------------------------------

class TestSendDebtReminders:
    def test_disabled_returns_zero(self, db: Session, club: Club):
        settings = {"debt_weekly": {"enabled": False}}
        assert send_debt_reminders(db, club, settings, date.today()) == 0

    def test_wrong_weekday_returns_zero(self, db: Session, club: Club):
        # weekday 1 = Tuesday; pick a day that is not Tuesday
        settings = {"debt_weekly": {"enabled": True, "weekday": 1, "min_debt": 0.0}}
        # find a date that is not weekday 1
        d = date.today()
        while d.weekday() == 1:
            d += timedelta(days=1)
        assert send_debt_reminders(db, club, settings, d) == 0

    def test_sends_for_debtors(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "Debtor")
        evening = _make_evening(db, club, user)
        player = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name="Debtor")
        db.add(player)
        db.commit()
        db.refresh(player)
        _make_penalty_log(db, evening, player, 10.0)

        # Find a date with the right weekday
        d = date.today()
        while d.weekday() != 1:
            d += timedelta(days=1)

        settings = {"debt_weekly": {"enabled": True, "weekday": 1, "min_debt": 5.0}}
        with patch("core.reminders.push_to_regular_member") as mock_push:
            result = send_debt_reminders(db, club, settings, d)
        assert result >= 1
        mock_push.assert_called()

    def test_no_push_when_debt_below_minimum(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "LowDebtor")
        evening = _make_evening(db, club, user)
        player = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name="LowDebtor")
        db.add(player)
        db.commit()
        db.refresh(player)
        _make_penalty_log(db, evening, player, 1.0)  # below min_debt of 5

        d = date.today()
        while d.weekday() != 1:
            d += timedelta(days=1)

        settings = {"debt_weekly": {"enabled": True, "weekday": 1, "min_debt": 5.0}}
        with patch("core.reminders.push_to_regular_member") as mock_push:
            result = send_debt_reminders(db, club, settings, d)
        assert result == 0
        mock_push.assert_not_called()


# ---------------------------------------------------------------------------
# send_upcoming_evening_reminders
# ---------------------------------------------------------------------------

class TestSendUpcomingEveningReminders:
    def test_disabled_returns_zero(self, db: Session, club: Club):
        settings = {"upcoming_evening": {"enabled": False}}
        assert send_upcoming_evening_reminders(db, club, settings, date.today()) == 0

    def test_no_upcoming_returns_zero(self, db: Session, club: Club):
        settings = {"upcoming_evening": {"enabled": True, "days_before": 5}}
        assert send_upcoming_evening_reminders(db, club, settings, date.today()) == 0

    def test_sends_to_subscribed_users(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "Sub User")
        user.regular_member_id = member.id
        db.commit()

        days_before = 5
        _make_scheduled_evening(db, club, user, days_from_now=days_before)

        sub = PushSubscription(
            user_id=user.id,
            endpoint="https://push.example.com/reminder-test",
            p256dh="p256dh-key",
            auth="auth-key",
        )
        db.add(sub)
        db.commit()

        settings = {"upcoming_evening": {"enabled": True, "days_before": days_before}}
        today = date.today()
        with patch("core.reminders._send_one") as mock_send:
            result = send_upcoming_evening_reminders(db, club, settings, today)
        assert result >= 1
        mock_send.assert_called()

    def test_skips_users_who_opted_out(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "Opted Out")
        user.regular_member_id = member.id
        user.push_preferences = {"reminder_schedule": False}
        db.commit()

        days_before = 5
        _make_scheduled_evening(db, club, user, days_from_now=days_before)

        settings = {"upcoming_evening": {"enabled": True, "days_before": days_before}}
        today = date.today()
        with patch("core.reminders._send_one") as mock_send:
            result = send_upcoming_evening_reminders(db, club, settings, today)
        # user opted out so no sends expected
        mock_send.assert_not_called()
        assert result == 0


# ---------------------------------------------------------------------------
# send_rsvp_reminders
# ---------------------------------------------------------------------------

class TestSendRsvpReminders:
    def test_disabled_returns_zero(self, db: Session, club: Club):
        settings = {"rsvp_reminder": {"enabled": False}}
        assert send_rsvp_reminders(db, club, settings, date.today()) == 0

    def test_no_upcoming_returns_zero(self, db: Session, club: Club):
        settings = {"rsvp_reminder": {"enabled": True, "days_before": 3}}
        assert send_rsvp_reminders(db, club, settings, date.today()) == 0

    def test_sends_to_members_without_rsvp(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "NoRsvp")
        days_before = 3
        _make_scheduled_evening(db, club, user, days_from_now=days_before)

        settings = {"rsvp_reminder": {"enabled": True, "days_before": days_before}}
        today = date.today()
        with patch("core.reminders.push_to_regular_member") as mock_push:
            result = send_rsvp_reminders(db, club, settings, today)
        assert result >= 1
        mock_push.assert_called()

    def test_skips_members_with_rsvp(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "HasRsvp")
        days_before = 3
        se = _make_scheduled_evening(db, club, user, days_from_now=days_before)

        rsvp = MemberRsvp(
            scheduled_evening_id=se.id,
            regular_member_id=member.id,
            status="attending",
        )
        db.add(rsvp)
        db.commit()

        settings = {"rsvp_reminder": {"enabled": True, "days_before": days_before}}
        today = date.today()
        with patch("core.reminders.push_to_regular_member") as mock_push:
            result = send_rsvp_reminders(db, club, settings, today)
        # member already responded, no reminder for them
        assert result == 0
        mock_push.assert_not_called()


# ---------------------------------------------------------------------------
# send_debt_day_of_reminders
# ---------------------------------------------------------------------------

class TestSendDebtDayOfReminders:
    def test_disabled_returns_zero(self, db: Session, club: Club):
        settings = {"debt_day_of": {"enabled": False}}
        assert send_debt_day_of_reminders(db, club, settings, date.today()) == 0

    def test_no_evening_today_returns_zero(self, db: Session, club: Club):
        settings = {"debt_day_of": {"enabled": True}}
        # Use yesterday so there's no evening scheduled today
        yesterday = date.today() - timedelta(days=1)
        assert send_debt_day_of_reminders(db, club, settings, yesterday) == 0

    def test_sends_to_debtors_when_evening_today(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "DayOfDebtor")
        evening = _make_evening(db, club, user)
        player = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name="DayOfDebtor")
        db.add(player)
        db.commit()
        db.refresh(player)
        _make_penalty_log(db, evening, player, 5.0)

        today = date.today()
        # Create a scheduled evening for today
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc) + timedelta(hours=20),
            created_by=user.id,
        )
        db.add(se)
        db.commit()

        settings = {"debt_day_of": {"enabled": True}}
        with patch("core.reminders.push_to_regular_member") as mock_push:
            result = send_debt_day_of_reminders(db, club, settings, today)
        assert result >= 1
        mock_push.assert_called()


# ---------------------------------------------------------------------------
# send_payment_request_nudge
# ---------------------------------------------------------------------------

class TestSendPaymentRequestNudge:
    def test_disabled_returns_zero(self, db: Session, club: Club):
        settings = {"payment_request_nudge": {"enabled": False}}
        assert send_payment_request_nudge(db, club, settings, date.today()) == 0

    def test_no_pending_returns_zero(self, db: Session, club: Club):
        settings = {"payment_request_nudge": {"enabled": True, "days_pending": 3}}
        assert send_payment_request_nudge(db, club, settings, date.today()) == 0

    def test_sends_to_admins_when_pending_requests(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "Payer")
        # Create a payment request that is old enough
        old_time = datetime.now(timezone.utc) - timedelta(days=5)
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=member.id,
            amount=10.0,
            status=PaymentRequestStatus.pending,
            created_at=old_time,
        )
        db.add(req)
        db.commit()

        settings = {"payment_request_nudge": {"enabled": True, "days_pending": 3}}
        with patch("core.reminders.push_to_club_admins") as mock_push:
            result = send_payment_request_nudge(db, club, settings, date.today())
        assert result >= 1
        mock_push.assert_called_once()

    def test_ignores_recent_requests(self, db: Session, club: Club, user: User):
        member = _make_member(db, club, "RecentPayer")
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=member.id,
            amount=5.0,
            status=PaymentRequestStatus.pending,
        )
        db.add(req)
        db.commit()

        settings = {"payment_request_nudge": {"enabled": True, "days_pending": 3}}
        with patch("core.reminders.push_to_club_admins") as mock_push:
            result = send_payment_request_nudge(db, club, settings, date.today())
        assert result == 0
        mock_push.assert_not_called()


# ---------------------------------------------------------------------------
# send_auto_report_reminder
# ---------------------------------------------------------------------------

class TestSendAutoReportReminder:
    def test_disabled_returns_zero(self, db: Session, club: Club):
        settings = {"auto_report": {"enabled": False}}
        assert send_auto_report_reminder(db, club, settings, date.today()) == 0

    def test_no_upcoming_returns_zero(self, db: Session, club: Club):
        settings = {"auto_report": {"enabled": True, "days_before": 1}}
        assert send_auto_report_reminder(db, club, settings, date.today()) == 0

    def test_sends_to_admins_when_evening_tomorrow(self, db: Session, club: Club, user: User):
        days_before = 1
        se = _make_scheduled_evening(db, club, user, days_from_now=days_before)
        se.venue = "Kegelhalle"
        db.commit()

        settings = {"auto_report": {"enabled": True, "days_before": days_before}}
        with patch("core.reminders.push_to_club_admins") as mock_push:
            result = send_auto_report_reminder(db, club, settings, date.today())
        assert result == 1
        mock_push.assert_called_once()

    def test_no_match_when_evening_wrong_day(self, db: Session, club: Club, user: User):
        # Evening in 3 days but days_before=1
        _make_scheduled_evening(db, club, user, days_from_now=3)
        settings = {"auto_report": {"enabled": True, "days_before": 1}}
        with patch("core.reminders.push_to_club_admins") as mock_push:
            result = send_auto_report_reminder(db, club, settings, date.today())
        assert result == 0
        mock_push.assert_not_called()


# ---------------------------------------------------------------------------
# send_all_reminders
# ---------------------------------------------------------------------------

class TestSendAllReminders:
    def test_runs_without_error_for_club_without_settings(self, db: Session, club: Club):
        """Club without settings is skipped (no error raised)."""
        asyncio.run(send_all_reminders(db))

    def test_runs_all_functions_for_club_with_settings(self, db: Session, club: Club):
        _make_club_settings(db, club)
        fns = [
            "core.reminders.send_debt_reminders",
            "core.reminders.send_upcoming_evening_reminders",
            "core.reminders.send_rsvp_reminders",
            "core.reminders.send_debt_day_of_reminders",
            "core.reminders.send_payment_request_nudge",
            "core.reminders.send_auto_report_reminder",
        ]
        with patch("core.reminders.send_debt_reminders", return_value=0) as m1, \
             patch("core.reminders.send_upcoming_evening_reminders", return_value=0) as m2, \
             patch("core.reminders.send_rsvp_reminders", return_value=0) as m3, \
             patch("core.reminders.send_debt_day_of_reminders", return_value=0) as m4, \
             patch("core.reminders.send_payment_request_nudge", return_value=0) as m5, \
             patch("core.reminders.send_auto_report_reminder", return_value=0) as m6:
            asyncio.run(send_all_reminders(db))
        m1.assert_called_once()
        m2.assert_called_once()
        m3.assert_called_once()
        m4.assert_called_once()
        m5.assert_called_once()
        m6.assert_called_once()

    def test_logs_exception_and_continues(self, db: Session, club: Club):
        """Exceptions in individual reminder functions are caught and logged."""
        _make_club_settings(db, club)
        with patch("core.reminders.send_debt_reminders", side_effect=RuntimeError("boom")):
            # Must not raise — exception is caught internally
            asyncio.run(send_all_reminders(db))

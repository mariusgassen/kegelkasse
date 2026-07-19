"""
Tests for the personalized email digest (Feature #8 extension):
  - core/i18n.py helpers (locale fallback, date & money formatting)
  - core/digest.py (due logic, digest builder, empty-skip)
  - core/email.py digest rendering (theme + locale + deep links)
  - GET/PATCH /push/preferences digest_frequency round-trip
  - POST /push/digest/test (member) — auth, config guard, send (SMTP mocked)

All SMTP traffic is mocked — these tests never open a socket.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from core import digest as digest_mod
from core.digest import (build_digest, is_digest_due, send_all_digests)
from core.email import build_digest_email, email_theme
from core.i18n import format_date, format_money, normalize_locale, t
from models.club import Club, ClubSettings
from models.evening import Evening, EveningPlayer, RegularMember
from models.payment import MemberPayment
from models.penalty import PenaltyLog
from models.push import NotificationLog
from models.user import User


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup_digest(db: Session, club: Club):
    yield
    db.query(PenaltyLog).delete(synchronize_session=False)
    db.query(MemberPayment).delete(synchronize_session=False)
    db.query(EveningPlayer).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.query(NotificationLog).delete(synchronize_session=False)
    db.commit()


def _configure_email(db: Session, club: Club) -> None:
    s = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
    if not s:
        s = ClubSettings(club_id=club.id, extra={})
        db.add(s)
    s.primary_color = "#8b0000"
    extra = dict(s.extra or {})
    extra["email"] = {
        "enabled": True, "host": "smtp.example.com", "port": 587,
        "username": "u", "password": "p", "from_address": "noreply@example.com",
        "from_name": "Test Club", "use_tls": True, "use_ssl": False,
    }
    s.extra = extra
    db.commit()


@pytest.fixture()
def member(db: Session, club: Club, user: User) -> RegularMember:
    m = RegularMember(club_id=club.id, name="Max Mustermann", nickname="Maxi", is_active=True)
    db.add(m)
    db.commit()
    db.refresh(m)
    user.regular_member_id = m.id
    user.email = "member@test.de"
    user.preferred_locale = "de"
    db.commit()
    return m


def _add_penalty(db, evening_id, player_id, member_id, when, amount=2.0):
    p = PenaltyLog(
        evening_id=evening_id, player_id=player_id, regular_member_id=member_id,
        player_name="Maxi", penalty_type_name="Pumpe", icon="⚠️", amount=amount,
        mode="euro", client_timestamp=0.0, created_at=when, is_deleted=False,
    )
    db.add(p)
    db.commit()
    return p


# ---------------------------------------------------------------------------
# i18n helpers
# ---------------------------------------------------------------------------

def test_normalize_locale_fallback():
    assert normalize_locale("en") == "en"
    assert normalize_locale("de-DE") == "de"
    assert normalize_locale("fr") == "de"      # unsupported → default
    assert normalize_locale(None) == "de"


def test_format_date_localized():
    d = datetime(2026, 3, 15, tzinfo=timezone.utc)
    assert format_date(d, "de") == "15. März 2026"
    assert format_date(d, "en") == "March 15, 2026"


def test_format_money_localized():
    assert format_money(12.5, "de") == "12,50 €"
    assert format_money(12.5, "en") == "12.50 €"


def test_translate_uses_params_and_fallback():
    assert t("de", "digest.greeting", name="Maxi") == "Hallo Maxi,"
    assert t("en", "digest.greeting", name="Sam") == "Hi Sam,"
    assert t("de", "nonexistent.key") == "nonexistent.key"  # missing → key echoed


# ---------------------------------------------------------------------------
# Due logic
# ---------------------------------------------------------------------------

def test_is_digest_due(db: Session, user: User):
    now = datetime(2026, 3, 15, 8, 0, tzinfo=timezone.utc)
    user.push_preferences = {"digest_frequency": "off"}
    assert is_digest_due(user, now) is False

    user.push_preferences = {"digest_frequency": "weekly"}
    user.last_digest_at = None
    assert is_digest_due(user, now) is True                          # first ever

    user.last_digest_at = now - timedelta(days=3)
    assert is_digest_due(user, now) is False                         # too soon

    user.last_digest_at = now - timedelta(days=8)
    assert is_digest_due(user, now) is True                          # elapsed


# ---------------------------------------------------------------------------
# Digest builder
# ---------------------------------------------------------------------------

def test_build_digest_none_without_member(db: Session, user: User):
    now = datetime.now(timezone.utc)
    user.regular_member_id = None
    assert build_digest(db, user, None, now) is None


def test_build_digest_none_when_no_changes(db: Session, user: User, member: RegularMember):
    now = datetime(2026, 6, 1, tzinfo=timezone.utc)
    since = now - timedelta(days=7)
    # No evenings, penalties, bookings in window → empty → None
    assert build_digest(db, user, since, now) is None


def test_build_digest_collects_personal_activity(db: Session, club: Club, user: User, member: RegularMember):
    now = datetime(2026, 6, 10, 8, 0, tzinfo=timezone.utc)
    since = now - timedelta(days=7)
    inside = now - timedelta(days=2)

    e = Evening(club_id=club.id, date=inside, venue="Kegelbahn", is_closed=False, created_at=inside)
    db.add(e)
    db.commit()
    db.refresh(e)
    pl = EveningPlayer(evening_id=e.id, regular_member_id=member.id, name="Maxi")
    db.add(pl)
    db.commit()
    db.refresh(pl)
    _add_penalty(db, e.id, pl.id, None, inside, amount=3.0)
    db.add(MemberPayment(club_id=club.id, regular_member_id=member.id, amount=10.0,
                         note="Bar bezahlt", created_at=inside, is_deleted=False))
    db.commit()

    data = build_digest(db, user, since, now)
    assert data is not None
    assert data["member_name"] == "Maxi"
    assert len(data["evenings"]) == 1
    assert data["evenings"][0]["url"] == f"/#schedule?evening={e.id}"
    assert len(data["penalties"]) == 1
    assert len(data["bookings"]) == 1
    # Balance: paid 10 − penalty 3 = 7
    assert data["balance"]["balance"] == 7.0
    assert data["balance"]["penalty_total"] == 3.0
    assert data["balance"]["paid_total"] == 10.0
    assert data["balance"]["url"] == f"/#treasury:accounts?member={member.id}"


def test_build_digest_excludes_old_activity(db: Session, club: Club, user: User, member: RegularMember):
    now = datetime(2026, 6, 10, tzinfo=timezone.utc)
    since = now - timedelta(days=7)
    old = now - timedelta(days=30)
    e = Evening(club_id=club.id, date=old, venue="Alt", is_closed=True, created_at=old, ended_at=old)
    db.add(e)
    db.commit()
    db.refresh(e)
    pl = EveningPlayer(evening_id=e.id, regular_member_id=member.id, name="Maxi")
    db.add(pl)
    db.commit()
    db.refresh(pl)
    _add_penalty(db, e.id, pl.id, None, old, amount=5.0)
    db.commit()
    # Old evening/penalty predate the window → nothing fresh → None
    assert build_digest(db, user, since, now) is None


# ---------------------------------------------------------------------------
# Email rendering
# ---------------------------------------------------------------------------

def test_email_theme_uses_club_primary(db: Session, club: Club):
    _configure_email(db, club)
    db.refresh(club)
    theme = email_theme(club)
    assert theme["primary"] == "#8b0000"
    assert theme["on_primary"] == "#ffffff"       # dark red → white text
    assert theme["club_name"] == "Test Club"


def test_build_digest_email_renders_sections_and_links():
    theme = email_theme(None)
    data = {
        "member_name": "Maxi",
        "since": datetime(2026, 6, 3, tzinfo=timezone.utc),
        "balance": {"balance": 7.0, "penalty_total": 3.0, "paid_total": 10.0,
                    "url": "/#treasury:accounts?member=1"},
        "evenings": [{"label": "10. Juni 2026", "value": "Neuer Abend", "url": "/#schedule?evening=5"}],
        "penalties": [{"label": "⚠️ Pumpe", "value": "3,00 €", "url": "/#treasury:accounts?member=1"}],
        "bookings": [], "community": [], "has_content": True,
    }
    with patch("core.email.settings.APP_BASE_URL", "https://app.example.com"):
        subject, text, html = build_digest_email(theme, data, "de")
    assert subject == "Deine Kegelkasse-Zusammenfassung"
    assert "Hallo Maxi," in text
    assert "Neuer Abend" in text
    assert "Kegelabende" in html                  # localized section heading
    assert "https://app.example.com/#schedule?evening=5" in html   # absolute deep link
    # English variant
    _, text_en, _ = build_digest_email(theme, data, "en")
    assert "Hi Maxi," in text_en


# ---------------------------------------------------------------------------
# send_all_digests
# ---------------------------------------------------------------------------

def test_send_all_digests_sends_when_due(db: Session, club: Club, user: User, member: RegularMember):
    import asyncio
    _configure_email(db, club)
    user.push_preferences = {"digest_frequency": "daily"}
    user.last_digest_at = None
    db.commit()

    now = datetime(2026, 6, 10, 8, 0, tzinfo=timezone.utc)
    e = Evening(club_id=club.id, date=now - timedelta(hours=2), venue="X",
                created_at=now - timedelta(hours=2))
    db.add(e)
    db.commit()

    with patch.object(digest_mod, "send_club_email") as mock_send:
        sent = asyncio.get_event_loop().run_until_complete(send_all_digests(db, now))
    assert sent == 1
    mock_send.assert_called_once()
    db.refresh(user)
    assert user.last_digest_at is not None         # cadence advanced

    # Second run same day → not due → no send
    with patch.object(digest_mod, "send_club_email") as mock_send2:
        sent2 = asyncio.get_event_loop().run_until_complete(send_all_digests(db, now))
    assert sent2 == 0
    mock_send2.assert_not_called()


# ---------------------------------------------------------------------------
# API — preferences + test endpoint
# ---------------------------------------------------------------------------

def test_preferences_include_digest_frequency(client, auth_headers):
    r = client.get("/api/v1/push/preferences", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["digest_frequency"] == "off"


def test_patch_digest_frequency_persists(client, auth_headers, db, user):
    r = client.patch("/api/v1/push/preferences", headers=auth_headers,
                     json={"digest_frequency": "weekly"})
    assert r.status_code == 200
    assert r.json()["digest_frequency"] == "weekly"
    # invalid value ignored
    r2 = client.patch("/api/v1/push/preferences", headers=auth_headers,
                      json={"digest_frequency": "hourly"})
    assert r2.json()["digest_frequency"] == "weekly"


def test_digest_test_requires_email_config(client, auth_headers, db, member):
    r = client.post("/api/v1/push/digest/test", headers=auth_headers)
    assert r.status_code == 400


def test_digest_test_sends(client, auth_headers, db, club, member):
    _configure_email(db, club)
    with patch("core.email.send_club_email") as mock_send:
        r = client.post("/api/v1/push/digest/test", headers=auth_headers)
    assert r.status_code == 200
    mock_send.assert_called_once()

"""
Tests for the Telegram notification channel:
  - core/telegram.py helpers (config resolution — Bot API calls mocked)
  - GET/PATCH /club/telegram-settings, POST /club/telegram-settings/test (admin)
  - POST /push/telegram/link-start, DELETE /push/telegram/link (member)
  - POST /telegram/webhook/{club_id}/{secret} (public)
  - notification dispatch honouring the 'telegram' channel (send mocked)

No real Telegram Bot API traffic — httpx calls are mocked throughout.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings
from models.push import NotificationLog
from models.user import TelegramLinkCode, User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup_telegram(db: Session, club: Club):
    yield
    # Children before parents: link codes reference users, users belong to the club.
    db.query(TelegramLinkCode).filter(TelegramLinkCode.user_id.in_(
        [u.id for u in db.query(User).filter(User.club_id == club.id).all()]
    )).delete(synchronize_session=False)
    db.query(NotificationLog).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin_user(db: Session, club: Club) -> User:
    u = User(
        email="admin@test.de",
        name="Test Admin",
        hashed_password=get_password_hash("adminpass"),
        role=UserRole.admin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def admin_headers(admin_user: User) -> dict:
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}


def _configure_telegram(db: Session, club: Club, **overrides) -> ClubSettings:
    cfg = {
        "enabled": True,
        "bot_token": "123:ABC-test-token",
        "bot_username": "test_club_bot",
        "webhook_secret": "whsecret",
    }
    cfg.update(overrides)
    s = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
    if not s:
        s = ClubSettings(club_id=club.id, extra={})
        db.add(s)
    extra = dict(s.extra or {})
    extra["telegram"] = cfg
    s.extra = extra
    db.commit()
    db.refresh(s)
    return s


# ---------------------------------------------------------------------------
# core/telegram.py
# ---------------------------------------------------------------------------

class TestTelegramConfig:
    def test_returns_none_when_no_settings(self, db, club):
        from core.telegram import get_club_telegram_config
        db.refresh(club)
        assert get_club_telegram_config(club) is None

    def test_returns_none_when_disabled(self, db, club):
        from core.telegram import get_club_telegram_config
        _configure_telegram(db, club, enabled=False)
        db.refresh(club)
        assert get_club_telegram_config(club) is None

    def test_returns_none_when_token_missing(self, db, club):
        from core.telegram import get_club_telegram_config
        _configure_telegram(db, club, bot_token="")
        db.refresh(club)
        assert get_club_telegram_config(club) is None

    def test_returns_config_when_enabled_and_complete(self, db, club):
        from core.telegram import get_club_telegram_config
        _configure_telegram(db, club)
        db.refresh(club)
        cfg = get_club_telegram_config(club)
        assert cfg is not None
        assert cfg["bot_username"] == "test_club_bot"


# ---------------------------------------------------------------------------
# GET/PATCH /club/telegram-settings, POST .../test
# ---------------------------------------------------------------------------

class TestTelegramSettingsEndpoints:
    def test_get_requires_admin(self, client: TestClient, auth_headers: dict):
        r = client.get("/api/v1/club/telegram-settings", headers=auth_headers)
        assert r.status_code == 403

    def test_get_401_without_auth(self, client: TestClient):
        assert client.get("/api/v1/club/telegram-settings").status_code == 401

    def test_get_returns_defaults(self, client: TestClient, admin_headers: dict):
        r = client.get("/api/v1/club/telegram-settings", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is False
        assert data["bot_token_set"] is False
        assert data["bot_username"] == ""

    def test_patch_requires_admin(self, client: TestClient, auth_headers: dict):
        r = client.patch("/api/v1/club/telegram-settings", headers=auth_headers, json={"enabled": True})
        assert r.status_code == 403

    def test_patch_validates_and_saves_token(self, client: TestClient, admin_headers: dict, db, club):
        with patch("core.telegram.get_bot_info", return_value={"username": "my_bot"}), \
             patch("core.telegram.set_webhook") as mock_webhook, \
             patch("core.config.settings.APP_BASE_URL", "https://app.example.com"):
            r = client.patch("/api/v1/club/telegram-settings", headers=admin_headers, json={
                "enabled": True, "bot_token": "123:XYZ",
            })
        assert r.status_code == 200
        data = r.json()
        assert data["bot_username"] == "my_bot"
        assert data["bot_token_set"] is True
        assert "bot_token" not in data  # never leaked
        mock_webhook.assert_called_once()
        db.refresh(club)
        assert club.settings.extra["telegram"]["bot_token"] != "123:XYZ"  # encrypted at rest

    def test_patch_rejects_invalid_token(self, client: TestClient, admin_headers: dict):
        with patch("core.telegram.get_bot_info", side_effect=ValueError("Unauthorized")):
            r = client.patch("/api/v1/club/telegram-settings", headers=admin_headers, json={
                "bot_token": "bad-token",
            })
        assert r.status_code == 400

    def test_patch_keeps_token_when_not_provided(self, client: TestClient, admin_headers: dict, db, club):
        _configure_telegram(db, club, bot_username="original_bot")
        r = client.patch("/api/v1/club/telegram-settings", headers=admin_headers, json={"enabled": False})
        assert r.status_code == 200
        db.refresh(club)
        assert club.settings.extra["telegram"]["bot_username"] == "original_bot"
        assert club.settings.extra["telegram"]["enabled"] is False

    def test_patch_disabling_deletes_webhook(self, client: TestClient, admin_headers: dict, db, club):
        _configure_telegram(db, club)
        with patch("core.telegram.delete_webhook") as mock_delete:
            r = client.patch("/api/v1/club/telegram-settings", headers=admin_headers, json={"enabled": False})
        assert r.status_code == 200
        mock_delete.assert_called_once()

    def test_status_reports_telegram_configured(self, client: TestClient, auth_headers: dict, db, club):
        _configure_telegram(db, club)
        r = client.get("/api/v1/push/status", headers=auth_headers)
        data = r.json()
        assert data["telegram_configured"] is True
        assert data["telegram_linked"] is False

    def test_test_endpoint_requires_admin(self, client: TestClient, auth_headers: dict):
        r = client.post("/api/v1/club/telegram-settings/test", headers=auth_headers)
        assert r.status_code == 403

    def test_test_endpoint_400_when_not_configured(self, client: TestClient, admin_headers: dict):
        r = client.post("/api/v1/club/telegram-settings/test", headers=admin_headers)
        assert r.status_code == 400

    def test_test_endpoint_400_when_admin_not_linked(self, client: TestClient, admin_headers: dict, db, club):
        _configure_telegram(db, club)
        r = client.post("/api/v1/club/telegram-settings/test", headers=admin_headers)
        assert r.status_code == 400

    def test_test_endpoint_sends_message(self, client: TestClient, admin_headers: dict, db, club, admin_user):
        _configure_telegram(db, club)
        admin_user.telegram_chat_id = "999"
        db.commit()
        with patch("core.telegram.send_telegram_message") as mock_send:
            r = client.post("/api/v1/club/telegram-settings/test", headers=admin_headers)
        assert r.status_code == 200
        mock_send.assert_called_once()


# ---------------------------------------------------------------------------
# POST /push/telegram/link-start, DELETE /push/telegram/link
# ---------------------------------------------------------------------------

class TestTelegramLinkStart:
    def test_requires_auth(self, client: TestClient):
        assert client.post("/api/v1/push/telegram/link-start").status_code == 401

    def test_400_when_not_configured(self, client: TestClient, auth_headers: dict):
        r = client.post("/api/v1/push/telegram/link-start", headers=auth_headers)
        assert r.status_code == 400

    def test_creates_code_and_deep_link(self, client: TestClient, auth_headers: dict, db, club, user):
        _configure_telegram(db, club)
        r = client.post("/api/v1/push/telegram/link-start", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["deep_link"].startswith("https://t.me/test_club_bot?start=")
        code = data["deep_link"].split("start=")[1]
        row = db.query(TelegramLinkCode).filter(TelegramLinkCode.code == code).first()
        assert row is not None
        assert row.user_id == user.id
        assert row.used_at is None


class TestTelegramUnlink:
    def test_requires_auth(self, client: TestClient):
        assert client.delete("/api/v1/push/telegram/link").status_code == 401

    def test_clears_chat_id(self, client: TestClient, auth_headers: dict, db, user):
        user.telegram_chat_id = "12345"
        db.commit()
        r = client.delete("/api/v1/push/telegram/link", headers=auth_headers)
        assert r.status_code == 204
        db.refresh(user)
        assert user.telegram_chat_id is None


# ---------------------------------------------------------------------------
# POST /telegram/webhook/{club_id}/{secret}
# ---------------------------------------------------------------------------

class TestTelegramWebhook:
    def _link_code(self, db, user, **overrides):
        row = TelegramLinkCode(
            user_id=user.id,
            code=overrides.pop("code", "abc123"),
            expires_at=overrides.pop("expires_at", datetime.now(timezone.utc) + timedelta(minutes=10)),
            used_at=overrides.pop("used_at", None),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    def test_wrong_secret_404(self, client: TestClient, db, club):
        _configure_telegram(db, club)
        r = client.post(f"/api/v1/telegram/webhook/{club.id}/wrong-secret",
                       json={"message": {"chat": {"id": 1}, "text": "/start abc"}})
        assert r.status_code == 404

    def test_unknown_club_404(self, client: TestClient):
        r = client.post("/api/v1/telegram/webhook/999999/whatever", json={})
        assert r.status_code == 404

    def test_malformed_body_never_500s(self, client: TestClient, db, club):
        _configure_telegram(db, club)
        r = client.post(f"/api/v1/telegram/webhook/{club.id}/whsecret", content=b"not json",
                       headers={"Content-Type": "application/json"})
        assert r.status_code == 200

    def test_no_start_command_is_noop(self, client: TestClient, db, club):
        _configure_telegram(db, club)
        r = client.post(f"/api/v1/telegram/webhook/{club.id}/whsecret",
                       json={"message": {"chat": {"id": 1}, "text": "hello"}})
        assert r.status_code == 200

    def test_invalid_code_replies_without_linking(self, client: TestClient, db, club):
        _configure_telegram(db, club)
        with patch("core.telegram.send_telegram_message") as mock_send:
            r = client.post(f"/api/v1/telegram/webhook/{club.id}/whsecret",
                           json={"message": {"chat": {"id": 555}, "text": "/start doesnotexist"}})
        assert r.status_code == 200
        mock_send.assert_called_once()
        assert "abgelaufen" in mock_send.call_args[0][2] or "ungültig" in mock_send.call_args[0][2]

    def test_expired_code_replies_without_linking(self, client: TestClient, db, club, user):
        _configure_telegram(db, club)
        self._link_code(db, user, code="expired1",
                        expires_at=datetime.now(timezone.utc) - timedelta(minutes=1))
        with patch("core.telegram.send_telegram_message") as mock_send:
            r = client.post(f"/api/v1/telegram/webhook/{club.id}/whsecret",
                           json={"message": {"chat": {"id": 555}, "text": "/start expired1"}})
        assert r.status_code == 200
        mock_send.assert_called_once()
        db.refresh(user)
        assert user.telegram_chat_id is None

    def test_valid_code_links_chat_and_consumes_code(self, client: TestClient, db, club, user):
        _configure_telegram(db, club)
        code_row = self._link_code(db, user, code="goodcode")
        with patch("core.telegram.send_telegram_message") as mock_send:
            r = client.post(f"/api/v1/telegram/webhook/{club.id}/whsecret",
                           json={"message": {"chat": {"id": 424242}, "text": "/start goodcode"}})
        assert r.status_code == 200
        db.refresh(user)
        assert user.telegram_chat_id == "424242"
        db.refresh(code_row)
        assert code_row.used_at is not None
        mock_send.assert_called_once()
        assert "Verbunden" in mock_send.call_args[0][2]

    def test_used_code_cannot_be_replayed(self, client: TestClient, db, club, user):
        _configure_telegram(db, club)
        self._link_code(db, user, code="onceonly", used_at=datetime.now(timezone.utc))
        with patch("core.telegram.send_telegram_message"):
            r = client.post(f"/api/v1/telegram/webhook/{club.id}/whsecret",
                           json={"message": {"chat": {"id": 1}, "text": "/start onceonly"}})
        assert r.status_code == 200
        db.refresh(user)
        assert user.telegram_chat_id is None

    def test_code_for_other_club_is_rejected(self, client: TestClient, db, club, user):
        """Defense in depth: even though the URL already scopes to a club, a code whose
        owner belongs to a different club must not link (should never happen in practice)."""
        _configure_telegram(db, club)
        other_club = Club(name="Other Club", slug="other-club")
        db.add(other_club)
        db.commit()
        db.refresh(other_club)
        other_user = User(email="other@test.de", name="Other", hashed_password=get_password_hash("x"),
                         role=UserRole.member, club_id=other_club.id, is_active=True)
        db.add(other_user)
        db.commit()
        db.refresh(other_user)
        self._link_code(db, other_user, code="crossclub")
        with patch("core.telegram.send_telegram_message"):
            r = client.post(f"/api/v1/telegram/webhook/{club.id}/whsecret",
                           json={"message": {"chat": {"id": 1}, "text": "/start crossclub"}})
        assert r.status_code == 200
        db.refresh(other_user)
        assert other_user.telegram_chat_id is None
        db.query(TelegramLinkCode).filter(TelegramLinkCode.user_id == other_user.id).delete()
        db.delete(other_user)
        db.query(ClubSettings).filter(ClubSettings.club_id == other_club.id).delete()
        db.delete(other_club)
        db.commit()


# ---------------------------------------------------------------------------
# Dispatch: telegram channel
# ---------------------------------------------------------------------------

class TestTelegramChannelDispatch:
    def test_notify_user_sends_telegram_when_channel_and_linked(self, db, club):
        _configure_telegram(db, club)
        u = User(email="tg@test.de", name="TG", hashed_password=get_password_hash("x"),
                 role=UserRole.member, club_id=club.id, is_active=True,
                 telegram_chat_id="555", push_preferences={"penalties": ["telegram"]})
        db.add(u)
        db.commit()
        db.refresh(u)
        with patch("core.telegram.send_telegram_message") as mock_send, \
             patch("core.push._send_one") as mock_push:
            from core.push import notify_user
            delivered = notify_user(db, u, "Title", "Body", "/x", category="penalties")
        assert delivered is True
        mock_send.assert_called_once()
        mock_push.assert_not_called()
        assert db.query(NotificationLog).filter(NotificationLog.user_id == u.id).count() == 1
        db.query(NotificationLog).filter(NotificationLog.user_id == u.id).delete()
        db.delete(u)
        db.commit()

    def test_notify_user_skips_telegram_when_not_linked(self, db, club):
        """Channel enabled but the user never completed the link flow: no chat_id, no send."""
        _configure_telegram(db, club)
        u = User(email="unlinked@test.de", name="Unlinked", hashed_password=get_password_hash("x"),
                 role=UserRole.member, club_id=club.id, is_active=True,
                 push_preferences={"penalties": ["telegram"]})
        db.add(u)
        db.commit()
        db.refresh(u)
        with patch("core.telegram.send_telegram_message") as mock_send:
            from core.push import notify_user
            delivered = notify_user(db, u, "Title", "Body", "/x", category="penalties")
        assert delivered is True  # still logged for the in-app bell
        mock_send.assert_not_called()
        db.query(NotificationLog).filter(NotificationLog.user_id == u.id).delete()
        db.delete(u)
        db.commit()

    def test_push_to_club_sends_telegram(self, db, club):
        _configure_telegram(db, club)
        u = User(email="broadcast@test.de", name="Broadcast", hashed_password=get_password_hash("x"),
                 role=UserRole.member, club_id=club.id, is_active=True,
                 telegram_chat_id="777", push_preferences={"evenings": ["telegram"]})
        db.add(u)
        db.commit()
        db.refresh(u)
        with patch("core.telegram.send_telegram_message") as mock_send:
            from core.push import push_to_club
            push_to_club(db, club.id, "T", "B", "/x", category="evenings")
        mock_send.assert_called_once()
        db.query(NotificationLog).filter(NotificationLog.user_id == u.id).delete()
        db.delete(u)
        db.commit()

"""
Tests for per-club email (SMTP) support:
  - core/email.py helpers (config resolution, body building, send — smtplib mocked)
  - GET/PATCH /club/email-settings, POST /club/email-settings/test (admin)
  - notification dispatch honouring the 'email' channel (send mocked)

All SMTP traffic is mocked — these tests never open a socket.
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings
from models.push import NotificationLog, PushSubscription
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup_email(db: Session, club: Club):
    yield
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


def _configure_email(db: Session, club: Club, **overrides) -> ClubSettings:
    cfg = {
        "enabled": True,
        "host": "smtp.example.com",
        "port": 587,
        "username": "user@example.com",
        "password": "secret",
        "from_address": "noreply@example.com",
        "from_name": "Test Club",
        "use_tls": True,
        "use_ssl": False,
    }
    cfg.update(overrides)
    s = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
    if not s:
        s = ClubSettings(club_id=club.id, extra={})
        db.add(s)
    extra = dict(s.extra or {})
    extra["email"] = cfg
    s.extra = extra
    db.commit()
    db.refresh(s)
    return s


# ---------------------------------------------------------------------------
# core/email.py
# ---------------------------------------------------------------------------

class TestEmailConfig:
    def test_returns_none_when_no_settings(self, db, club):
        from core.email import get_club_email_config
        db.refresh(club)
        assert get_club_email_config(club) is None

    def test_returns_none_when_disabled(self, db, club):
        from core.email import get_club_email_config
        _configure_email(db, club, enabled=False)
        db.refresh(club)
        assert get_club_email_config(club) is None

    def test_returns_none_when_host_missing(self, db, club):
        from core.email import get_club_email_config
        _configure_email(db, club, host="")
        db.refresh(club)
        assert get_club_email_config(club) is None

    def test_returns_config_when_enabled_and_complete(self, db, club):
        from core.email import get_club_email_config
        _configure_email(db, club)
        db.refresh(club)
        cfg = get_club_email_config(club)
        assert cfg is not None
        assert cfg["host"] == "smtp.example.com"


class TestPerClubBaseUrl:
    """A club's own email.base_url overrides the server-wide APP_BASE_URL for its links."""

    def test_email_theme_prefers_club_base_url(self, db, club):
        from core.config import settings
        from core.email import email_theme
        _configure_email(db, club, base_url="https://kegeln.meinverein.de")
        db.refresh(club)
        with patch.object(settings, "APP_BASE_URL", "https://app.example.com"):
            theme = email_theme(club)
        assert theme["base_url"] == "https://kegeln.meinverein.de"

    def test_email_theme_falls_back_to_server_base_url(self, db, club):
        from core.config import settings
        from core.email import email_theme
        _configure_email(db, club, base_url="")
        db.refresh(club)
        with patch.object(settings, "APP_BASE_URL", "https://app.example.com"):
            theme = email_theme(club)
        assert theme["base_url"] == "https://app.example.com"

    def test_logo_url_uses_club_base_url(self, db, club):
        from core.config import settings
        from core.email import email_theme
        _configure_email(db, club, base_url="https://kegeln.meinverein.de")
        s = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
        s.logo_url = "/uploads/club_1/logo.png"
        db.commit()
        db.refresh(club)
        with patch.object(settings, "APP_BASE_URL", "https://app.example.com"):
            theme = email_theme(club)
        assert theme["logo_url"] == "https://kegeln.meinverein.de/uploads/club_1/logo.png"

    def test_abs_link_prefers_explicit_base_url(self):
        from core.config import settings
        from core.email import _abs_link
        with patch.object(settings, "APP_BASE_URL", "https://app.example.com"):
            assert _abs_link("/x", "https://kegeln.meinverein.de") == "https://kegeln.meinverein.de/x"
            assert _abs_link("/x", None) == "https://app.example.com/x"
            assert _abs_link("/x", "") == "https://app.example.com/x"

    def test_digest_email_links_use_club_base_url(self):
        from core.config import settings
        from core.email import build_digest_email
        theme = {"primary": "#8b0000", "on_primary": "#ffffff", "club_name": "Test Club",
                 "logo_url": None, "base_url": "https://kegeln.meinverein.de"}
        data = {
            "member_name": "Maxi", "since": None,
            "balance": {"balance": 7.0, "penalty_total": 3.0, "paid_total": 10.0,
                        "url": "/#treasury:accounts?member=1"},
            "evenings": [], "penalties": [], "bookings": [], "community": [], "has_content": True,
        }
        with patch.object(settings, "APP_BASE_URL", "https://app.example.com"):
            _, text, html = build_digest_email(theme, data, "de")
        assert "https://kegeln.meinverein.de/#treasury:accounts?member=1" in html
        assert "https://kegeln.meinverein.de/" in text          # the "open app" CTA link
        assert "app.example.com" not in html and "app.example.com" not in text


class TestBuildBodies:
    def test_no_link_without_base_url(self):
        from core.config import settings
        from core.email import build_email_bodies
        with patch.object(settings, "APP_BASE_URL", ""):
            text, html = build_email_bodies("Title", "Body", "/schedule")
        assert "Title" in text and "Body" in text
        assert "http" not in text  # no absolute link built

    def test_absolute_link_from_base_url(self):
        from core.config import settings
        from core.email import build_email_bodies
        with patch.object(settings, "APP_BASE_URL", "https://app.example.com"):
            text, html = build_email_bodies("T", "B", "/#treasury")
        assert "https://app.example.com/#treasury" in text
        assert "https://app.example.com/#treasury" in html

    def test_full_url_passed_through(self):
        from core.email import build_email_bodies
        text, _ = build_email_bodies("T", "B", "https://x.example.com/y")
        assert "https://x.example.com/y" in text


class TestSecretCrypto:
    def test_round_trip(self):
        from core.crypto import decrypt_secret, encrypt_secret, is_encrypted
        enc = encrypt_secret("hunter2")
        assert is_encrypted(enc)
        assert enc != "hunter2"
        assert decrypt_secret(enc) == "hunter2"

    def test_empty_is_noop(self):
        from core.crypto import decrypt_secret, encrypt_secret
        assert encrypt_secret("") == ""
        assert decrypt_secret("") == ""

    def test_plaintext_passthrough(self):
        # Legacy plaintext (no prefix) is returned unchanged.
        from core.crypto import decrypt_secret, is_encrypted
        assert not is_encrypted("plain")
        assert decrypt_secret("plain") == "plain"

    def test_bad_token_returns_empty(self):
        from core.crypto import decrypt_secret
        assert decrypt_secret("enc:v1:not-a-valid-token") == ""

    def test_uses_configured_key_over_secret_key_fallback(self):
        from cryptography.fernet import Fernet
        from core.config import settings
        from core.crypto import decrypt_secret, encrypt_secret
        key = Fernet.generate_key().decode()
        with patch.object(settings, "SECRETS_ENCRYPTION_KEY", key):
            enc = encrypt_secret("hunter2")
            assert decrypt_secret(enc) == "hunter2"
        # Without the configured key (SECRET_KEY-derived fallback), it no longer decrypts.
        with patch.object(settings, "SECRETS_ENCRYPTION_KEY", ""):
            assert decrypt_secret(enc) == ""

    def test_key_rotation_decrypts_old_and_encrypts_with_new(self):
        from cryptography.fernet import Fernet
        from core.config import settings
        from core.crypto import decrypt_secret, encrypt_secret
        old_key = Fernet.generate_key().decode()
        new_key = Fernet.generate_key().decode()

        # Encrypt under the old key.
        with patch.object(settings, "SECRETS_ENCRYPTION_KEY", old_key):
            old_ct = encrypt_secret("s3cr3t")

        # Rotate: new key first, old key kept for decryption.
        with patch.object(settings, "SECRETS_ENCRYPTION_KEY", f"{new_key},{old_key}"):
            assert decrypt_secret(old_ct) == "s3cr3t"      # old ciphertext still readable
            new_ct = encrypt_secret("s3cr3t")               # new writes use the new key
            assert new_ct != old_ct

        # After dropping the old key, the old ciphertext is unreadable but the new one works.
        with patch.object(settings, "SECRETS_ENCRYPTION_KEY", new_key):
            assert decrypt_secret(new_ct) == "s3cr3t"
            assert decrypt_secret(old_ct) == ""

    def test_invalid_key_entries_ignored_falls_back(self):
        from core.config import settings
        from core.crypto import decrypt_secret, encrypt_secret
        # All-invalid list → falls back to the SECRET_KEY-derived key, still works.
        with patch.object(settings, "SECRETS_ENCRYPTION_KEY", "not-a-key, also-bad "):
            enc = encrypt_secret("x")
            assert decrypt_secret(enc) == "x"


class TestSendClubEmail:
    def test_uses_starttls(self, db, club):
        from core.email import send_club_email
        cfg = {"host": "smtp.example.com", "port": 587, "username": "u", "password": "p",
               "from_address": "from@x.de", "use_tls": True, "use_ssl": False}
        smtp_instance = MagicMock()
        with patch("smtplib.SMTP") as mock_smtp:
            mock_smtp.return_value.__enter__.return_value = smtp_instance
            send_club_email(cfg, "to@x.de", "Subj", "text", "<p>html</p>")
        smtp_instance.starttls.assert_called_once()
        smtp_instance.login.assert_called_once_with("u", "p")
        smtp_instance.send_message.assert_called_once()

    def test_decrypts_encrypted_password_before_login(self, db, club):
        from core.crypto import encrypt_secret
        from core.email import send_club_email
        cfg = {"host": "smtp.example.com", "port": 587, "username": "u",
               "password": encrypt_secret("s3cr3t"), "from_address": "from@x.de",
               "use_tls": True, "use_ssl": False}
        smtp_instance = MagicMock()
        with patch("smtplib.SMTP") as mock_smtp:
            mock_smtp.return_value.__enter__.return_value = smtp_instance
            send_club_email(cfg, "to@x.de", "Subj", "text")
        # login receives the decrypted password, not the stored ciphertext
        smtp_instance.login.assert_called_once_with("u", "s3cr3t")

    def test_uses_ssl(self, db, club):
        from core.email import send_club_email
        cfg = {"host": "smtp.example.com", "port": 465, "username": "", "password": "",
               "from_address": "from@x.de", "use_ssl": True}
        smtp_instance = MagicMock()
        with patch("smtplib.SMTP_SSL") as mock_ssl:
            mock_ssl.return_value.__enter__.return_value = smtp_instance
            send_club_email(cfg, "to@x.de", "Subj", "text")
        mock_ssl.assert_called_once()
        smtp_instance.login.assert_not_called()  # no username → no login
        smtp_instance.send_message.assert_called_once()


# ---------------------------------------------------------------------------
# API: /club/email-settings
# ---------------------------------------------------------------------------

class TestEmailSettingsEndpoints:
    def test_get_requires_admin(self, client: TestClient, auth_headers: dict):
        r = client.get("/api/v1/club/email-settings", headers=auth_headers)
        assert r.status_code == 403

    def test_get_401_without_auth(self, client: TestClient):
        assert client.get("/api/v1/club/email-settings").status_code == 401

    def test_get_returns_defaults(self, client: TestClient, admin_headers: dict):
        r = client.get("/api/v1/club/email-settings", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is False
        assert data["port"] == 587
        assert data["password_set"] is False

    def test_patch_saves_config_and_masks_password(self, client: TestClient, admin_headers: dict):
        r = client.patch("/api/v1/club/email-settings", headers=admin_headers, json={
            "enabled": True, "host": "smtp.example.com", "port": 465,
            "username": "u@example.com", "password": "topsecret",
            "from_address": "noreply@example.com", "use_ssl": True, "use_tls": False,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["host"] == "smtp.example.com"
        assert data["password_set"] is True
        assert "password" not in data  # never leaked

    def test_patch_encrypts_password_at_rest(self, client: TestClient, admin_headers: dict, db, club):
        from core.crypto import decrypt_secret, is_encrypted
        r = client.patch("/api/v1/club/email-settings", headers=admin_headers, json={
            "enabled": True, "host": "smtp.example.com", "from_address": "x@y.de",
            "password": "topsecret",
        })
        assert r.status_code == 200
        db.refresh(club)
        stored = club.settings.extra["email"]["password"]
        assert stored != "topsecret"          # not stored in plaintext
        assert is_encrypted(stored)           # carries the enc: prefix
        assert decrypt_secret(stored) == "topsecret"  # round-trips back

    def test_patch_keeps_password_when_not_provided(self, client: TestClient, admin_headers: dict, db, club):
        _configure_email(db, club, password="original")
        r = client.patch("/api/v1/club/email-settings", headers=admin_headers,
                         json={"from_name": "New Name"})
        assert r.status_code == 200
        db.refresh(club)
        assert club.settings.extra["email"]["password"] == "original"
        assert club.settings.extra["email"]["from_name"] == "New Name"

    def test_patch_requires_admin(self, client: TestClient, auth_headers: dict):
        r = client.patch("/api/v1/club/email-settings", headers=auth_headers, json={"host": "x"})
        assert r.status_code == 403

    def test_base_url_round_trips(self, client: TestClient, admin_headers: dict, db, club):
        r = client.patch("/api/v1/club/email-settings", headers=admin_headers, json={
            "enabled": True, "host": "smtp.example.com", "from_address": "x@y.de",
            "base_url": "https://kegeln.meinverein.de",
        })
        assert r.status_code == 200
        assert r.json()["base_url"] == "https://kegeln.meinverein.de"
        r2 = client.get("/api/v1/club/email-settings", headers=admin_headers)
        assert r2.json()["base_url"] == "https://kegeln.meinverein.de"

    def test_base_url_defaults_empty(self, client: TestClient, admin_headers: dict):
        r = client.get("/api/v1/club/email-settings", headers=admin_headers)
        assert r.json()["base_url"] == ""

    def test_status_reports_email_configured(self, client: TestClient, auth_headers: dict, db, club):
        _configure_email(db, club)
        r = client.get("/api/v1/push/status", headers=auth_headers)
        assert r.json()["email_configured"] is True


class TestTestEmailEndpoint:
    def test_400_when_not_configured(self, client: TestClient, admin_headers: dict):
        r = client.post("/api/v1/club/email-settings/test", headers=admin_headers, json={})
        assert r.status_code == 400

    def test_sends_test_email(self, client: TestClient, admin_headers: dict, db, club):
        _configure_email(db, club)
        with patch("core.email.send_club_email") as mock_send:
            r = client.post("/api/v1/club/email-settings/test", headers=admin_headers,
                           json={"to": "target@x.de"})
        assert r.status_code == 200
        assert r.json()["sent_to"] == "target@x.de"
        mock_send.assert_called_once()

    def test_400_on_send_failure(self, client: TestClient, admin_headers: dict, db, club):
        _configure_email(db, club)
        with patch("core.email.send_club_email", side_effect=RuntimeError("SMTP down")):
            r = client.post("/api/v1/club/email-settings/test", headers=admin_headers, json={})
        assert r.status_code == 400

    def test_requires_admin(self, client: TestClient, auth_headers: dict):
        r = client.post("/api/v1/club/email-settings/test", headers=auth_headers, json={})
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# Dispatch: email channel
# ---------------------------------------------------------------------------

class TestEmailChannelDispatch:
    def test_notify_user_sends_email_when_channel_email(self, db, club):
        _configure_email(db, club)
        u = User(email="e@test.de", name="E", hashed_password=get_password_hash("x"),
                 role=UserRole.member, club_id=club.id, is_active=True,
                 push_preferences={"penalties": "email"})
        db.add(u)
        db.commit()
        db.refresh(u)
        with patch("core.email.send_notification_email", return_value=True) as mock_email, \
             patch("core.push._send_one") as mock_push:
            from core.push import notify_user
            notify_user(db, u, "Title", "Body", "/x", category="penalties")
        mock_email.assert_called_once()
        mock_push.assert_not_called()
        # still logged to the in-app bell
        assert db.query(NotificationLog).filter(NotificationLog.user_id == u.id).count() == 1
        db.query(NotificationLog).filter(NotificationLog.user_id == u.id).delete()
        db.delete(u)
        db.commit()

    def test_notify_user_sends_both_when_push_and_email(self, db, club):
        """A category with both channels on delivers push *and* email (and logs once)."""
        _configure_email(db, club)
        u = User(email="both@test.de", name="Both", hashed_password=get_password_hash("x"),
                 role=UserRole.member, club_id=club.id, is_active=True,
                 push_preferences={"penalties": ["push", "email"]})
        db.add(u)
        db.commit()
        db.refresh(u)
        db.add(PushSubscription(user_id=u.id, endpoint="https://push.test/both",
                                p256dh="p", auth="a"))
        db.commit()
        with patch("core.email.send_notification_email", return_value=True) as mock_email, \
             patch("core.push._send_one") as mock_push, \
             patch("core.push.settings.VAPID_PRIVATE_KEY", "vapid-key"):
            from core.push import notify_user
            delivered = notify_user(db, u, "Title", "Body", "/x", category="penalties")
        assert delivered is True
        mock_email.assert_called_once()
        mock_push.assert_called_once()
        # logged exactly once for the in-app bell, not once per channel
        assert db.query(NotificationLog).filter(NotificationLog.user_id == u.id).count() == 1
        db.query(PushSubscription).filter(PushSubscription.user_id == u.id).delete()
        db.query(NotificationLog).filter(NotificationLog.user_id == u.id).delete()
        db.delete(u)
        db.commit()

    def test_notify_user_off_channel_skips_everything(self, db, club):
        _configure_email(db, club)
        u = User(email="off@test.de", name="Off", hashed_password=get_password_hash("x"),
                 role=UserRole.member, club_id=club.id, is_active=True,
                 push_preferences={"penalties": "off"})
        db.add(u)
        db.commit()
        db.refresh(u)
        with patch("core.email.send_notification_email") as mock_email, \
             patch("core.push._send_one") as mock_push:
            from core.push import notify_user
            delivered = notify_user(db, u, "T", "B", "/x", category="penalties")
        assert delivered is False
        mock_email.assert_not_called()
        mock_push.assert_not_called()
        assert db.query(NotificationLog).filter(NotificationLog.user_id == u.id).count() == 0
        db.delete(u)
        db.commit()

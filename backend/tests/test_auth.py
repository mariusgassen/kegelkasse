"""Tests for authentication endpoints — login, profile, invite, register, reset."""
import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.user import User, UserRole, InviteToken, PasswordResetToken
from models.evening import RegularMember
from models.club import ClubSettings
from datetime import datetime, timedelta, UTC


def _configure_club_email(db, club) -> None:
    """Give the club a minimally-complete SMTP config so reset emails can send."""
    s = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
    if not s:
        s = ClubSettings(club_id=club.id, extra={})
        db.add(s)
    extra = dict(s.extra or {})
    extra["email"] = {
        "enabled": True,
        "host": "smtp.example.com",
        "port": 587,
        "from_address": "noreply@example.com",
    }
    s.extra = extra
    db.commit()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db, club):
    u = User(
        email="admin@test.de",
        name="Test Admin",
        username="testadmin",
        hashed_password=get_password_hash("adminpass"),
        role=UserRole.admin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def admin_headers(admin_user):
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def cleanup_auth_state(db, club):
    """Runs before club fixture teardown — clears RegularMembers, tokens, rate-limit state."""
    from api.v1.auth import _reset_hits
    _reset_hits.clear()  # isolate the in-memory reset rate limiter between tests
    yield
    _reset_hits.clear()
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(InviteToken).delete(synchronize_session=False)
    db.query(PasswordResetToken).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# POST /api/v1/auth/login
# ---------------------------------------------------------------------------

class TestLogin:
    def test_login_with_email(self, client: TestClient, user):
        resp = client.post("/api/v1/auth/login", json={"email": "member@test.de", "password": "testpass"})
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "member@test.de"

    def test_login_with_username(self, client: TestClient, db, user):
        user.username = "testmember"
        db.commit()
        resp = client.post("/api/v1/auth/login", json={"email": "testmember", "password": "testpass"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_with_username_case_insensitive(self, client: TestClient, db, user):
        user.username = "testmember"
        db.commit()
        resp = client.post("/api/v1/auth/login", json={"email": "TestMember", "password": "testpass"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_with_email_case_insensitive(self, client: TestClient, user):
        resp = client.post("/api/v1/auth/login", json={"email": "MEMBER@TEST.DE", "password": "testpass"})
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    def test_login_wrong_password(self, client: TestClient, user):
        resp = client.post("/api/v1/auth/login", json={"email": "member@test.de", "password": "wrong"})
        assert resp.status_code == 401

    def test_login_unknown_user(self, client: TestClient):
        resp = client.post("/api/v1/auth/login", json={"email": "nobody@test.de", "password": "pass"})
        assert resp.status_code == 401

    def test_login_deactivated_account(self, client: TestClient, db, user):
        user.is_active = False
        db.commit()
        resp = client.post("/api/v1/auth/login", json={"email": "member@test.de", "password": "testpass"})
        assert resp.status_code == 401
        assert "deactivated" in resp.json()["detail"].lower()
        user.is_active = True
        db.commit()


# ---------------------------------------------------------------------------
# GET /api/v1/auth/me
# ---------------------------------------------------------------------------

class TestGetMe:
    def test_get_me_returns_user(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == user.email
        assert data["id"] == user.id

    def test_get_me_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /api/v1/auth/locale
# ---------------------------------------------------------------------------

class TestUpdateLocale:
    def test_update_locale(self, client: TestClient, db, user, auth_headers):
        resp = client.patch("/api/v1/auth/locale", json={"locale": "en"}, headers=auth_headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.preferred_locale == "en"

    def test_update_locale_requires_auth(self, client: TestClient):
        resp = client.patch("/api/v1/auth/locale", json={"locale": "en"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /api/v1/auth/avatar
# ---------------------------------------------------------------------------

class TestUpdateAvatar:
    def test_set_avatar(self, client: TestClient, db, user, auth_headers):
        avatar_data = "data:image/png;base64,iVBORw0KGgo="
        resp = client.patch("/api/v1/auth/avatar", json={"avatar": avatar_data}, headers=auth_headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.avatar == avatar_data

    def test_clear_avatar(self, client: TestClient, db, user, auth_headers):
        user.avatar = "some_data"
        db.commit()
        resp = client.patch("/api/v1/auth/avatar", json={"avatar": None}, headers=auth_headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.avatar is None

    def test_avatar_requires_auth(self, client: TestClient):
        resp = client.patch("/api/v1/auth/avatar", json={"avatar": None})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /api/v1/auth/profile
# ---------------------------------------------------------------------------

class TestUpdateProfile:
    def test_update_name(self, client: TestClient, db, user, auth_headers):
        resp = client.patch("/api/v1/auth/profile", json={"name": "New Name"}, headers=auth_headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.name == "New Name"

    def test_update_username(self, client: TestClient, db, user, auth_headers):
        resp = client.patch("/api/v1/auth/profile", json={"username": "newhandle"}, headers=auth_headers)
        assert resp.status_code == 200
        db.refresh(user)
        assert user.username == "newhandle"

    def test_username_conflict(self, client: TestClient, db, user, second_user, auth_headers):
        second_user.username = "taken"
        db.commit()
        resp = client.patch("/api/v1/auth/profile", json={"username": "taken"}, headers=auth_headers)
        assert resp.status_code == 400
        assert "username" in resp.json()["detail"].lower()

    def test_email_conflict(self, client: TestClient, db, user, second_user, auth_headers):
        resp = client.patch(
            "/api/v1/auth/profile",
            json={"email": second_user.email},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_change_password_with_internal_email(self, client: TestClient, db, user, auth_headers):
        # Users with @kegelkasse.internal emails can change password without current_password
        user.email = f"member_{user.id}@kegelkasse.internal"
        db.commit()
        resp = client.patch(
            "/api/v1/auth/profile",
            json={"new_password": "newpassword123"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        db.refresh(user)
        from core.security import verify_password
        assert verify_password("newpassword123", user.hashed_password)
        # Restore email and password so other tests still work
        user.email = "member@test.de"
        user.hashed_password = get_password_hash("testpass")
        db.commit()

    def test_change_password_wrong_current(self, client: TestClient, user, auth_headers):
        resp = client.patch(
            "/api/v1/auth/profile",
            json={"new_password": "newpass", "current_password": "wrongcurrent"},
            headers=auth_headers,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# DELETE /api/v1/auth/me
# ---------------------------------------------------------------------------

class TestDeleteOwnAccount:
    def test_soft_deletes_account(self, client: TestClient, db, user, auth_headers):
        resp = client.delete("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        db.refresh(user)
        assert user.is_active is False
        user.is_active = True
        db.commit()

    def test_requires_auth(self, client: TestClient):
        resp = client.delete("/api/v1/auth/me")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/auth/invite
# ---------------------------------------------------------------------------

class TestCreateInvite:
    def test_admin_can_create_invite(self, client: TestClient, admin_user, admin_headers):
        resp = client.post("/api/v1/auth/invite", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "invite_url" in data

    def test_member_cannot_create_invite(self, client: TestClient, user, auth_headers):
        resp = client.post("/api/v1/auth/invite", headers=auth_headers)
        assert resp.status_code == 403

    def test_requires_auth(self, client: TestClient):
        resp = client.post("/api/v1/auth/invite")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/auth/invite-info
# ---------------------------------------------------------------------------

class TestInviteInfo:
    def test_valid_token_returns_info(self, client: TestClient, db, admin_user, club):
        invite = InviteToken(
            token="validtoken123",
            club_id=club.id,
            created_by=admin_user.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(invite)
        db.commit()
        resp = client.get("/api/v1/auth/invite-info?token=validtoken123")
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    def test_invalid_token_returns_400(self, client: TestClient):
        resp = client.get("/api/v1/auth/invite-info?token=doesnotexist")
        assert resp.status_code == 400

    def test_expired_token_returns_400(self, client: TestClient, db, admin_user, club):
        invite = InviteToken(
            token="expiredtoken",
            club_id=club.id,
            created_by=admin_user.id,
            expires_at=datetime.now(UTC) - timedelta(days=1),
        )
        db.add(invite)
        db.commit()
        resp = client.get("/api/v1/auth/invite-info?token=expiredtoken")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/v1/auth/register
# ---------------------------------------------------------------------------

class TestRegister:
    def test_register_with_valid_invite(self, client: TestClient, db, admin_user, club):
        invite = InviteToken(
            token="regtoken123",
            club_id=club.id,
            created_by=admin_user.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(invite)
        db.commit()
        resp = client.post("/api/v1/auth/register", json={
            "token": "regtoken123",
            "name": "New User",
            "username": "newuser_reg",
            "password": "securepassword",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["name"] == "New User"
        # Registered user is cleaned up by cleanup_auth_state (RegularMember)
        # and by the club fixture teardown (User)

    def test_register_invalid_token(self, client: TestClient):
        resp = client.post("/api/v1/auth/register", json={
            "token": "invalidtoken",
            "name": "Someone",
            "username": "someone",
            "password": "password",
        })
        assert resp.status_code == 400

    def test_register_duplicate_username(self, client: TestClient, db, admin_user, club, user):
        user.username = "existinguser"
        db.commit()
        invite = InviteToken(
            token="dupusertoken",
            club_id=club.id,
            created_by=admin_user.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(invite)
        db.commit()
        resp = client.post("/api/v1/auth/register", json={
            "token": "dupusertoken",
            "name": "Dup User",
            "username": "existinguser",
            "password": "password",
        })
        assert resp.status_code == 400
        assert "username" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /api/v1/auth/create-reset-token
# ---------------------------------------------------------------------------

class TestCreateResetToken:
    def test_admin_can_create_reset_token(self, client: TestClient, admin_user, admin_headers, user):
        resp = client.post(
            "/api/v1/auth/create-reset-token",
            json={"user_id": user.id},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "reset_url" in data
        assert "username" in data

    def test_reset_token_returns_username(self, client: TestClient, db, admin_user, admin_headers, user):
        user.username = "resetme"
        db.commit()
        resp = client.post(
            "/api/v1/auth/create-reset-token",
            json={"user_id": user.id},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["username"] == "resetme"

    def test_member_cannot_create_reset_token(self, client: TestClient, user, auth_headers):
        resp = client.post(
            "/api/v1/auth/create-reset-token",
            json={"user_id": user.id},
            headers=auth_headers,
        )
        assert resp.status_code == 403

    def test_nonexistent_user_returns_404(self, client: TestClient, admin_headers):
        resp = client.post(
            "/api/v1/auth/create-reset-token",
            json={"user_id": 999999},
            headers=admin_headers,
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/auth/reset-password
# ---------------------------------------------------------------------------

class TestResetPassword:
    def test_valid_reset_token(self, client: TestClient, db, admin_user, user):
        reset = PasswordResetToken(
            token="resettoken123",
            user_id=user.id,
            created_by=admin_user.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(reset)
        db.commit()
        resp = client.post("/api/v1/auth/reset-password", json={
            "token": "resettoken123",
            "new_password": "mynewpassword",
        })
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        db.refresh(user)
        from core.security import verify_password
        assert verify_password("mynewpassword", user.hashed_password)
        # Restore password
        user.hashed_password = get_password_hash("testpass")
        db.commit()

    def test_invalid_reset_token(self, client: TestClient):
        resp = client.post("/api/v1/auth/reset-password", json={
            "token": "bogustoken",
            "new_password": "newpass",
        })
        assert resp.status_code == 400

    def test_expired_reset_token(self, client: TestClient, db, admin_user, user):
        reset = PasswordResetToken(
            token="expiredresettoken",
            user_id=user.id,
            created_by=admin_user.id,
            expires_at=datetime.now(UTC) - timedelta(days=1),
        )
        db.add(reset)
        db.commit()
        resp = client.post("/api/v1/auth/reset-password", json={
            "token": "expiredresettoken",
            "new_password": "newpass",
        })
        assert resp.status_code == 400

    def test_token_can_only_be_used_once(self, client: TestClient, db, admin_user, user):
        reset = PasswordResetToken(
            token="oncetoken",
            user_id=user.id,
            created_by=admin_user.id,
            expires_at=datetime.now(UTC) + timedelta(days=7),
        )
        db.add(reset)
        db.commit()
        r1 = client.post("/api/v1/auth/reset-password", json={"token": "oncetoken", "new_password": "pw1"})
        assert r1.status_code == 200
        r2 = client.post("/api/v1/auth/reset-password", json={"token": "oncetoken", "new_password": "pw2"})
        assert r2.status_code == 400
        # Restore password
        user.hashed_password = get_password_hash("testpass")
        db.commit()


# ---------------------------------------------------------------------------
# POST /api/v1/auth/request-password-reset  (self-service, Feature #77)
# ---------------------------------------------------------------------------

class TestRequestPasswordReset:
    def _count_tokens(self, db, user):
        return db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).count()

    def test_unknown_email_returns_generic_ok(self, client: TestClient, db):
        resp = client.post("/api/v1/auth/request-password-reset",
                            json={"email": "nobody@nowhere.de"})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_known_email_without_smtp_creates_no_token(self, client: TestClient, db, user):
        # No club email config → nothing can be delivered, still generic response.
        resp = client.post("/api/v1/auth/request-password-reset",
                            json={"email": user.email})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        assert self._count_tokens(db, user) == 0

    def test_known_email_with_smtp_creates_token_and_sends(self, client: TestClient, db, user, monkeypatch):
        _configure_club_email(db, club=user.club)
        sent = {}

        def _fake_send(cfg, to, reset_url, theme=None, locale=None):
            sent["to"] = to
            sent["reset_url"] = reset_url
            return True

        import core.email
        monkeypatch.setattr(core.email, "send_password_reset_email", _fake_send)

        resp = client.post("/api/v1/auth/request-password-reset",
                            json={"email": user.email.upper()})  # case-insensitive
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}
        assert self._count_tokens(db, user) == 1
        token = db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).first()
        assert token.created_by is None  # self-service — no admin creator
        assert sent["to"] == user.email
        assert token.token in sent["reset_url"]
        assert sent["reset_url"].startswith("/?reset=")

    def test_internal_email_creates_no_token(self, client: TestClient, db, club):
        _configure_club_email(db, club=club)
        internal = User(email="member_abc@kegelkasse.internal", name="Internal",
                        hashed_password=get_password_hash("x"), role=UserRole.member,
                        club_id=club.id, is_active=True)
        db.add(internal)
        db.commit()
        resp = client.post("/api/v1/auth/request-password-reset",
                            json={"email": internal.email})
        assert resp.status_code == 200
        assert self._count_tokens(db, internal) == 0

    def test_deactivated_account_creates_no_token(self, client: TestClient, db, user):
        _configure_club_email(db, club=user.club)
        user.is_active = False
        db.commit()
        resp = client.post("/api/v1/auth/request-password-reset",
                            json={"email": user.email})
        assert resp.status_code == 200
        assert self._count_tokens(db, user) == 0

    def test_empty_email_returns_generic_ok(self, client: TestClient):
        resp = client.post("/api/v1/auth/request-password-reset", json={"email": "  "})
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

    def test_rate_limited_per_email(self, client: TestClient, db, user, monkeypatch):
        _configure_club_email(db, club=user.club)
        import core.email
        monkeypatch.setattr(core.email, "send_password_reset_email",
                            lambda *a, **k: True)
        # 3 allowed per email/hour; the 4th is silently dropped (no new token).
        for _ in range(5):
            resp = client.post("/api/v1/auth/request-password-reset",
                                json={"email": user.email})
            assert resp.status_code == 200
            assert resp.json() == {"ok": True}
        assert self._count_tokens(db, user) == 3

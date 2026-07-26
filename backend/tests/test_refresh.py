"""Tests for rotating refresh-token sessions — issue, rotate, revoke, reuse."""
from datetime import datetime, timedelta, UTC

import pytest
from fastapi.testclient import TestClient

from core.config import settings
from core.refresh import (
    hash_refresh_token,
    issue_refresh_token,
    purge_expired,
    revoke_all_for_user,
    rotate_refresh_token,
)
from core.security import create_access_token, get_password_hash
from models.evening import RegularMember
from models.user import InviteToken, RefreshToken, User


@pytest.fixture(autouse=True)
def cleanup_refresh_tokens(db, club):
    """Runs before the club fixture's teardown — children before parents."""
    yield
    db.query(RefreshToken).delete(synchronize_session=False)
    db.query(InviteToken).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id, User.email != "member@test.de").delete(
        synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


def _login(client: TestClient) -> dict:
    resp = client.post("/api/v1/auth/login", json={"email": "member@test.de", "password": "testpass"})
    assert resp.status_code == 200
    return resp.json()


def _row(db, raw: str) -> RefreshToken:
    return db.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(raw)).one()


# ---------------------------------------------------------------------------
# Issuing
# ---------------------------------------------------------------------------

class TestLoginIssuesRefreshToken:
    def test_login_returns_both_tokens(self, client: TestClient, user):
        data = _login(client)
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["access_token"] != data["refresh_token"]

    def test_raw_token_is_never_stored(self, client: TestClient, db, user):
        raw = _login(client)["refresh_token"]
        assert db.query(RefreshToken).filter(RefreshToken.token_hash == raw).first() is None
        assert _row(db, raw).user_id == user.id

    def test_each_login_starts_its_own_family(self, client: TestClient, db, user):
        first = _login(client)["refresh_token"]
        second = _login(client)["refresh_token"]
        assert _row(db, first).family_id != _row(db, second).family_id

    def test_expiry_follows_config(self, client: TestClient, db, user):
        raw = _login(client)["refresh_token"]
        expires = _row(db, raw).expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        expected = datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        assert abs((expires - expected).total_seconds()) < 120


# ---------------------------------------------------------------------------
# POST /api/v1/auth/refresh
# ---------------------------------------------------------------------------

class TestRefreshEndpoint:
    def test_returns_a_working_access_token(self, client: TestClient, user):
        refresh = _login(client)["refresh_token"]
        resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["id"] == user.id
        me = client.get("/api/v1/auth/me",
                        headers={"Authorization": f"Bearer {data['access_token']}"})
        assert me.status_code == 200

    def test_rotates_the_refresh_token(self, client: TestClient, user):
        first = _login(client)["refresh_token"]
        second = client.post("/api/v1/auth/refresh", json={"refresh_token": first}).json()["refresh_token"]
        assert second != first
        # The successor works...
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": second}).status_code == 200

    def test_stays_in_the_same_family(self, client: TestClient, db, user):
        first = _login(client)["refresh_token"]
        second = client.post("/api/v1/auth/refresh", json={"refresh_token": first}).json()["refresh_token"]
        assert _row(db, first).family_id == _row(db, second).family_id

    def test_unknown_token_is_401(self, client: TestClient, user):
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": "nope"}).status_code == 401

    def test_expired_token_is_401(self, client: TestClient, db, user):
        raw = _login(client)["refresh_token"]
        row = _row(db, raw)
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": raw}).status_code == 401

    def test_deactivated_account_cannot_refresh(self, client: TestClient, db, user):
        raw = _login(client)["refresh_token"]
        user.is_active = False
        db.commit()
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": raw}).status_code == 401
        user.is_active = True
        db.commit()


# ---------------------------------------------------------------------------
# Reuse detection — the reason this is a table and not a second JWT
# ---------------------------------------------------------------------------

class TestReuseDetection:
    def test_replay_outside_grace_window_kills_the_family(self, client: TestClient, db, user):
        first = _login(client)["refresh_token"]
        second = client.post("/api/v1/auth/refresh", json={"refresh_token": first}).json()["refresh_token"]

        # Age the rotation past the grace window, then replay the spent token.
        row = _row(db, first)
        row.rotated_at = datetime.now(UTC) - timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS + 60)
        db.commit()

        assert client.post("/api/v1/auth/refresh", json={"refresh_token": first}).status_code == 401
        # The successor the real client holds is revoked too — theft costs the
        # session rather than granting one.
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": second}).status_code == 401

    def test_replay_inside_grace_window_is_served(self, client: TestClient, db, user):
        """Two tabs refreshing at once are not an attacker."""
        first = _login(client)["refresh_token"]
        second = client.post("/api/v1/auth/refresh", json={"refresh_token": first}).json()["refresh_token"]

        resp = client.post("/api/v1/auth/refresh", json={"refresh_token": first})
        assert resp.status_code == 200
        third = resp.json()["refresh_token"]
        assert third not in (first, second)
        # The other tab's token still works — nobody got logged out.
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": second}).status_code == 200

    def test_revoking_a_family_leaves_other_logins_alone(self, client: TestClient, db, user):
        stolen = _login(client)["refresh_token"]
        other_device = _login(client)["refresh_token"]
        client.post("/api/v1/auth/refresh", json={"refresh_token": stolen})
        row = _row(db, stolen)
        row.rotated_at = datetime.now(UTC) - timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS + 60)
        db.commit()
        client.post("/api/v1/auth/refresh", json={"refresh_token": stolen})

        assert client.post("/api/v1/auth/refresh", json={"refresh_token": other_device}).status_code == 200


# ---------------------------------------------------------------------------
# POST /api/v1/auth/logout
# ---------------------------------------------------------------------------

class TestLogout:
    def test_revokes_the_token(self, client: TestClient, user):
        refresh = _login(client)["refresh_token"]
        assert client.post("/api/v1/auth/logout", json={"refresh_token": refresh}).status_code == 200
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": refresh}).status_code == 401

    def test_leaves_other_devices_signed_in(self, client: TestClient, user):
        phone = _login(client)["refresh_token"]
        tablet = _login(client)["refresh_token"]
        client.post("/api/v1/auth/logout", json={"refresh_token": phone})
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": tablet}).status_code == 200

    def test_all_devices_signs_everything_out(self, client: TestClient, user):
        phone = _login(client)["refresh_token"]
        tablet = _login(client)["refresh_token"]
        client.post("/api/v1/auth/logout", json={"refresh_token": phone, "all_devices": True})
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": tablet}).status_code == 401

    def test_unknown_token_still_succeeds(self, client: TestClient, user):
        """A logout that can fail is a logout users learn to distrust."""
        assert client.post("/api/v1/auth/logout", json={"refresh_token": "nope"}).status_code == 200

    def test_no_token_still_succeeds(self, client: TestClient, user):
        assert client.post("/api/v1/auth/logout", json={}).status_code == 200

    def test_is_idempotent(self, client: TestClient, user):
        refresh = _login(client)["refresh_token"]
        client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
        assert client.post("/api/v1/auth/logout", json={"refresh_token": refresh}).status_code == 200


# ---------------------------------------------------------------------------
# Password changes end every session
# ---------------------------------------------------------------------------

class TestPasswordChangeRevokesSessions:
    def test_profile_password_change_revokes_other_sessions(self, client: TestClient, db, user):
        old_device = _login(client)["refresh_token"]
        session = _login(client)
        headers = {"Authorization": f"Bearer {session['access_token']}"}

        resp = client.patch("/api/v1/auth/profile", headers=headers,
                            json={"current_password": "testpass", "new_password": "newpass123"})
        assert resp.status_code == 200
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": old_device}).status_code == 401
        assert client.post("/api/v1/auth/refresh",
                           json={"refresh_token": session["refresh_token"]}).status_code == 401

    def test_current_device_gets_a_replacement(self, client: TestClient, db, user):
        """Changing your password must not log you out of the tab you did it in."""
        session = _login(client)
        headers = {"Authorization": f"Bearer {session['access_token']}"}
        resp = client.patch("/api/v1/auth/profile", headers=headers,
                            json={"current_password": "testpass", "new_password": "newpass123"})
        replacement = resp.json()["refresh_token"]
        assert replacement != session["refresh_token"]
        assert client.post("/api/v1/auth/refresh", json={"refresh_token": replacement}).status_code == 200

    def test_profile_edit_without_password_change_keeps_sessions(self, client: TestClient, user):
        session = _login(client)
        headers = {"Authorization": f"Bearer {session['access_token']}"}
        resp = client.patch("/api/v1/auth/profile", headers=headers, json={"name": "Renamed"})
        assert "refresh_token" not in resp.json()
        assert client.post("/api/v1/auth/refresh",
                           json={"refresh_token": session["refresh_token"]}).status_code == 200

    def test_account_deletion_revokes_sessions(self, client: TestClient, db, user):
        session = _login(client)
        headers = {"Authorization": f"Bearer {session['access_token']}"}
        assert client.delete("/api/v1/auth/me", headers=headers).status_code == 200
        assert client.post("/api/v1/auth/refresh",
                           json={"refresh_token": session["refresh_token"]}).status_code == 401
        user.is_active = True
        db.commit()


# ---------------------------------------------------------------------------
# Unit-level behaviour of core.refresh
# ---------------------------------------------------------------------------

class TestRefreshHelpers:
    def test_hash_is_stable_and_not_the_raw_token(self):
        raw = "some-token"
        assert hash_refresh_token(raw) == hash_refresh_token(raw)
        assert hash_refresh_token(raw) != raw
        assert len(hash_refresh_token(raw)) == 64

    def test_rotate_returns_none_for_unknown_token(self, db, user):
        assert rotate_refresh_token(db, "not-a-token") is None

    def test_revoke_all_returns_the_count(self, db, user):
        issue_refresh_token(db, user)
        issue_refresh_token(db, user)
        assert revoke_all_for_user(db, user.id) == 2
        # Already-revoked rows aren't counted twice.
        assert revoke_all_for_user(db, user.id) == 0

    def test_purge_drops_expired_rows(self, db, user):
        raw = issue_refresh_token(db, user)
        row = _row(db, raw)
        row.expires_at = datetime.now(UTC) - timedelta(days=1)
        db.commit()
        assert purge_expired(db) >= 1
        assert db.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(raw)).first() is None

    def test_purge_keeps_live_rows(self, db, user):
        raw = issue_refresh_token(db, user)
        purge_expired(db)
        assert _row(db, raw) is not None

    def test_purge_keeps_recently_revoked_rows_for_reuse_detection(self, db, user):
        raw = issue_refresh_token(db, user)
        revoke_all_for_user(db, user.id)
        purge_expired(db)
        assert _row(db, raw) is not None

    def test_logout_leaves_no_grace_window(self, db, user):
        """An explicit revoke is absolute — unlike a rotation, it has no grace."""
        raw = issue_refresh_token(db, user)
        revoke_all_for_user(db, user.id)
        assert rotate_refresh_token(db, raw) is None


# ---------------------------------------------------------------------------
# Access tokens stay short-lived — the refresh token carries the session
# ---------------------------------------------------------------------------

class TestAccessTokenIsShortLived:
    def test_default_is_an_hour(self):
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 60

    def test_refresh_default_is_a_year(self):
        assert settings.REFRESH_TOKEN_EXPIRE_DAYS == 365

    def test_expired_access_token_is_rejected(self, client: TestClient, user):
        expired = create_access_token({"sub": str(user.id)}, expires_delta=timedelta(seconds=-1))
        resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def test_register_returns_a_refresh_token(client: TestClient, db, club):
    from models.user import UserRole

    admin = User(email="inviter@test.de", name="Inviter",
                 hashed_password=get_password_hash("x"), role=UserRole.admin,
                 club_id=club.id, is_active=True)
    db.add(admin)
    db.commit()
    invite = InviteToken(token="invite-refresh-test", club_id=club.id, created_by=admin.id,
                         expires_at=datetime.now(UTC) + timedelta(days=1))
    db.add(invite)
    db.commit()

    resp = client.post("/api/v1/auth/register", json={
        "token": "invite-refresh-test", "password": "somepass123",
        "username": "newbie", "name": "Newbie",
    })
    assert resp.status_code == 200
    refresh = resp.json()["refresh_token"]
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": refresh}).status_code == 200

"""
Integration tests for push notification API endpoints.

Covers every route in api/v1/push.py using an in-memory SQLite database
and a FastAPI TestClient.  VAPID keys are injected / cleared per test so the
"not configured" branch is easy to reach.
"""
from unittest.mock import AsyncMock, patch

from core.config import settings
from models.push import PushSubscription

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FAKE_VAPID_PUBLIC = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
FAKE_VAPID_PRIVATE = "fake-private-key-value"

SUBSCRIBE_PAYLOAD = {
    "endpoint": "https://push.example.com/endpoint-abc",
    "p256dh": "p256dh-key-abc",
    "auth": "auth-key-abc",
}


# ---------------------------------------------------------------------------
# GET /push/vapid-key
# ---------------------------------------------------------------------------

class TestGetVapidKey:
    def test_returns_key_when_configured(self, client, auth_headers):
        with patch.object(settings, "VAPID_PUBLIC_KEY", FAKE_VAPID_PUBLIC):
            r = client.get("/api/v1/push/vapid-key", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["public_key"] == FAKE_VAPID_PUBLIC

    def test_503_when_not_configured(self, client, auth_headers):
        with patch.object(settings, "VAPID_PUBLIC_KEY", ""):
            r = client.get("/api/v1/push/vapid-key", headers=auth_headers)
        assert r.status_code == 503

    def test_401_without_auth(self, client):
        r = client.get("/api/v1/push/vapid-key")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# POST /push/subscribe
# ---------------------------------------------------------------------------

class TestSubscribe:
    def test_creates_subscription(self, client, auth_headers, db, user):
        r = client.post("/api/v1/push/subscribe", json=SUBSCRIBE_PAYLOAD, headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["ok"] is True

        sub = db.query(PushSubscription).filter(
            PushSubscription.endpoint == SUBSCRIBE_PAYLOAD["endpoint"]
        ).first()
        assert sub is not None
        assert sub.user_id == user.id
        assert sub.p256dh == SUBSCRIBE_PAYLOAD["p256dh"]
        assert sub.auth == SUBSCRIBE_PAYLOAD["auth"]

        # Cleanup
        db.delete(sub)
        db.commit()

    def test_upserts_on_duplicate_endpoint(self, client, auth_headers, db, user):
        """Second subscribe with same endpoint should update keys, not create duplicate."""
        payload = {**SUBSCRIBE_PAYLOAD, "endpoint": "https://push.example.com/upsert-test"}
        client.post("/api/v1/push/subscribe", json=payload, headers=auth_headers)

        updated = {**payload, "p256dh": "new-p256dh", "auth": "new-auth"}
        r = client.post("/api/v1/push/subscribe", json=updated, headers=auth_headers)
        assert r.status_code == 201

        subs = db.query(PushSubscription).filter(
            PushSubscription.endpoint == payload["endpoint"]
        ).all()
        assert len(subs) == 1
        db.refresh(subs[0])
        assert subs[0].p256dh == "new-p256dh"
        assert subs[0].auth == "new-auth"

        db.delete(subs[0])
        db.commit()

    def test_401_without_auth(self, client):
        r = client.post("/api/v1/push/subscribe", json=SUBSCRIBE_PAYLOAD)
        assert r.status_code == 401

    def test_422_missing_fields(self, client, auth_headers):
        r = client.post("/api/v1/push/subscribe", json={"endpoint": "only-endpoint"}, headers=auth_headers)
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# DELETE /push/unsubscribe
# ---------------------------------------------------------------------------

class TestUnsubscribe:
    def test_removes_all_subscriptions_for_user(self, client, auth_headers, db, user):
        sub = PushSubscription(
            user_id=user.id,
            endpoint="https://push.example.com/del-all",
            p256dh="p",
            auth="a",
        )
        db.add(sub)
        db.commit()

        r = client.delete("/api/v1/push/unsubscribe", headers=auth_headers)
        assert r.status_code == 204

        remaining = db.query(PushSubscription).filter(
            PushSubscription.user_id == user.id
        ).count()
        assert remaining == 0

    def test_removes_specific_subscription_by_endpoint(self, client, auth_headers, db, user):
        sub1 = PushSubscription(user_id=user.id, endpoint="https://push.example.com/del-one-A", p256dh="p", auth="a")
        sub2 = PushSubscription(user_id=user.id, endpoint="https://push.example.com/del-one-B", p256dh="p", auth="a")
        db.add_all([sub1, sub2])
        db.commit()

        # Save strings before the DELETE request invalidates the ORM objects
        endpoint1 = sub1.endpoint
        endpoint2 = sub2.endpoint

        r = client.delete(
            "/api/v1/push/unsubscribe",
            params={"endpoint": endpoint1},
            headers=auth_headers,
        )
        assert r.status_code == 204

        db.expire_all()
        assert db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint1).first() is None
        remaining = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint2).first()
        assert remaining is not None

        db.delete(remaining)
        db.commit()

    def test_does_not_delete_other_users_subscriptions(self, client, db, user, second_user):
        other_sub = PushSubscription(
            user_id=second_user.id,
            endpoint="https://push.example.com/other-user",
            p256dh="p",
            auth="a",
        )
        db.add(other_sub)
        db.commit()

        from core.security import create_access_token
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}
        client.delete("/api/v1/push/unsubscribe", headers=headers)

        db.expire_all()
        assert db.query(PushSubscription).filter(PushSubscription.id == other_sub.id).first() is not None

        db.delete(other_sub)
        db.commit()


# ---------------------------------------------------------------------------
# GET /push/status
# ---------------------------------------------------------------------------

class TestStatus:
    def test_not_subscribed_and_not_configured(self, client, auth_headers, db, user):
        db.query(PushSubscription).filter(PushSubscription.user_id == user.id).delete()
        db.commit()

        with patch.object(settings, "VAPID_PUBLIC_KEY", ""):
            r = client.get("/api/v1/push/status", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["subscribed"] is False
        assert body["configured"] is False

    def test_subscribed_and_configured(self, client, auth_headers, db, user):
        sub = PushSubscription(
            user_id=user.id,
            endpoint="https://push.example.com/status-test",
            p256dh="p",
            auth="a",
        )
        db.add(sub)
        db.commit()

        with patch.object(settings, "VAPID_PUBLIC_KEY", FAKE_VAPID_PUBLIC):
            r = client.get("/api/v1/push/status", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["subscribed"] is True
        assert body["configured"] is True

        db.delete(sub)
        db.commit()

    def test_401_without_auth(self, client):
        r = client.get("/api/v1/push/status")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# POST /push/test
# ---------------------------------------------------------------------------

class TestTestPush:
    def test_200_with_logged_true_when_vapid_not_configured(self, client, auth_headers):
        with patch.object(settings, "VAPID_PRIVATE_KEY", ""):
            r = client.post("/api/v1/push/test", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["logged"] is True
        assert r.json()["sent"] == 0

    def test_200_with_logged_true_when_no_subscription(self, client, auth_headers, db, user):
        db.query(PushSubscription).filter(PushSubscription.user_id == user.id).delete()
        db.commit()

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_VAPID_PRIVATE):
            r = client.post("/api/v1/push/test", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["logged"] is True
        assert r.json()["sent"] == 0

    def test_sends_to_all_user_subscriptions(self, client, auth_headers, db, user):
        sub1 = PushSubscription(user_id=user.id, endpoint="https://push.example.com/test-A", p256dh="p1", auth="a1")
        sub2 = PushSubscription(user_id=user.id, endpoint="https://push.example.com/test-B", p256dh="p2", auth="a2")
        db.add_all([sub1, sub2])
        db.commit()

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_VAPID_PRIVATE):
            with patch("core.push._send_one_raising") as mock_send:
                r = client.post("/api/v1/push/test", headers=auth_headers)

        assert r.status_code == 200
        assert r.json()["sent"] == 2
        assert mock_send.call_count == 2

        # Verify the correct title/body were used
        call_args = [c.args for c in mock_send.call_args_list]
        titles = [a[2] for a in call_args]
        bodies = [a[3] for a in call_args]
        assert all(t == "Kegelkasse 🎳" for t in titles)
        assert all("funktionieren" in b for b in bodies)

        db.delete(sub1)
        db.delete(sub2)
        db.commit()

    def test_401_without_auth(self, client):
        r = client.post("/api/v1/push/test")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /push/preferences
# ---------------------------------------------------------------------------

class TestGetPreferences:
    def test_returns_default_preferences(self, client, auth_headers):
        r = client.get("/api/v1/push/preferences", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["penalties"] is True
        assert data["evenings"] is True
        assert data["games"] is True
        assert data["reminder_debt"] is True

    def test_401_without_auth(self, client):
        r = client.get("/api/v1/push/preferences")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /push/preferences
# ---------------------------------------------------------------------------

class TestUpdatePreferences:
    def test_partial_update(self, client, auth_headers, db, user):
        r = client.patch(
            "/api/v1/push/preferences",
            json={"penalties": False, "games": False},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["penalties"] is False
        assert data["games"] is False
        # unmodified keys keep defaults
        assert data["evenings"] is True

    def test_full_round_trip(self, client, auth_headers, db, user):
        client.patch("/api/v1/push/preferences", json={"reminder_debt": False}, headers=auth_headers)
        r = client.get("/api/v1/push/preferences", headers=auth_headers)
        assert r.json()["reminder_debt"] is False
        # restore
        client.patch("/api/v1/push/preferences", json={"reminder_debt": True}, headers=auth_headers)

    def test_401_without_auth(self, client):
        r = client.patch("/api/v1/push/preferences", json={"penalties": False})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /push/debug
# ---------------------------------------------------------------------------

class TestDebugPush:
    def test_returns_debug_info(self, client, auth_headers):
        r = client.get("/api/v1/push/debug", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "vapid_configured" in data
        assert "subscription_count" in data
        assert "subscriptions" in data
        assert isinstance(data["subscriptions"], list)

    def test_subscription_count_accurate(self, client, auth_headers, db, user):
        sub = PushSubscription(
            user_id=user.id,
            endpoint="https://push.example.com/debug-test",
            p256dh="p",
            auth="a",
        )
        db.add(sub)
        db.commit()
        r = client.get("/api/v1/push/debug", headers=auth_headers)
        assert r.json()["subscription_count"] >= 1
        db.delete(sub)
        db.commit()

    def test_401_without_auth(self, client):
        r = client.get("/api/v1/push/debug")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /push/recent
# ---------------------------------------------------------------------------

class TestRecentNotifications:
    def test_returns_empty_by_default(self, client, auth_headers):
        r = client.get("/api/v1/push/recent", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_returns_unread_notification(self, client, auth_headers, db, user):
        from models.push import NotificationLog
        log = NotificationLog(
            user_id=user.id,
            title="Test",
            body="Hello",
            url="/",
            is_read=False,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/push/recent", headers=auth_headers)
        ids = [n["id"] for n in r.json()]
        assert log.id in ids
        db.delete(log)
        db.commit()

    def test_does_not_return_read_notifications(self, client, auth_headers, db, user):
        from models.push import NotificationLog
        log = NotificationLog(
            user_id=user.id,
            title="Read",
            body="Already read",
            url="/",
            is_read=True,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/push/recent", headers=auth_headers)
        ids = [n["id"] for n in r.json()]
        assert log.id not in ids
        db.delete(log)
        db.commit()

    def test_401_without_auth(self, client):
        r = client.get("/api/v1/push/recent")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# POST /push/notifications/read
# ---------------------------------------------------------------------------

class TestMarkNotificationsRead:
    def test_marks_all_read(self, client, auth_headers, db, user):
        from models.push import NotificationLog
        log = NotificationLog(user_id=user.id, title="T", body="B", url="/", is_read=False)
        db.add(log)
        db.commit()
        r = client.post("/api/v1/push/notifications/read", json={}, headers=auth_headers)
        assert r.status_code == 204
        db.expire(log)
        assert log.is_read is True
        db.delete(log)
        db.commit()

    def test_marks_specific_ids(self, client, auth_headers, db, user):
        from models.push import NotificationLog
        log1 = NotificationLog(user_id=user.id, title="T1", body="B", url="/", is_read=False)
        log2 = NotificationLog(user_id=user.id, title="T2", body="B", url="/", is_read=False)
        db.add_all([log1, log2])
        db.commit()
        client.post(
            "/api/v1/push/notifications/read",
            json={"ids": [log1.id]},
            headers=auth_headers,
        )
        db.expire_all()
        assert log1.is_read is True
        assert log2.is_read is False
        db.delete(log1)
        db.delete(log2)
        db.commit()

    def test_401_without_auth(self, client):
        r = client.post("/api/v1/push/notifications/read", json={})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# POST /push/trigger-reminders  (admin-only)
# ---------------------------------------------------------------------------

class TestTriggerReminders:
    def test_admin_can_trigger(self, client, db, club):
        from core.security import create_access_token, get_password_hash
        from models.user import User, UserRole
        admin = User(
            email="pushadmin@test.de",
            name="Push Admin",
            hashed_password=get_password_hash("pass"),
            role=UserRole.admin,
            club_id=club.id,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(admin.id)})}"}
        with patch("core.reminders.send_all_reminders", new=AsyncMock(return_value=None)):
            r = client.post("/api/v1/push/trigger-reminders", headers=headers)
        assert r.status_code == 200
        assert r.json()["ok"] is True
        db.delete(admin)
        db.commit()

    def test_member_forbidden(self, client, auth_headers):
        r = client.post("/api/v1/push/trigger-reminders", headers=auth_headers)
        assert r.status_code == 403

    def test_401_without_auth(self, client):
        r = client.post("/api/v1/push/trigger-reminders")
        assert r.status_code == 401

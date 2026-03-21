"""
Integration tests for push notification API endpoints.

Covers every route in api/v1/push.py using an in-memory SQLite database
and a FastAPI TestClient.  VAPID keys are injected / cleared per test so the
"not configured" branch is easy to reach.
"""
from unittest.mock import patch

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

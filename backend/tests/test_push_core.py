"""
Unit tests for core/push.py helper functions.

All outbound HTTP calls (pywebpush.webpush) are mocked so these tests never
hit the network.
"""
import base64
from unittest.mock import MagicMock, patch

from core.config import settings
from models.push import PushSubscription
from models.user import User, UserRole

FAKE_PRIVATE_KEY = "fake-private-key"


# ---------------------------------------------------------------------------
# _normalize_vapid_private_key
# ---------------------------------------------------------------------------

class TestNormalizeVapidPrivateKey:
    """Tests for all three storage formats and the PEM→raw round-trip."""

    def _raw_b64(self, key_obj) -> str:
        d = key_obj.private_numbers().private_value
        raw = d.to_bytes(32, "big")
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    def _gen_key(self):
        from cryptography.hazmat.primitives.asymmetric.ec import SECP256R1, generate_private_key
        return generate_private_key(SECP256R1())

    def test_raw_base64url_returned_unchanged(self):
        """A key without PEM headers is returned as-is."""
        from core.push import _normalize_vapid_private_key
        raw = "abc123-_XYZ"
        assert _normalize_vapid_private_key(raw) == raw

    def test_pem_real_newlines_converts_to_raw_b64(self):
        """PEM with real newlines is converted to raw base64url (32-byte EC scalar)."""
        from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
        from core.push import _normalize_vapid_private_key

        key = self._gen_key()
        pem = key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()).decode()

        result = _normalize_vapid_private_key(pem)

        assert result == self._raw_b64(key)

    def test_pem_escaped_newlines_converts_to_raw_b64(self):
        """PEM stored with literal \\n (Coolify / single-line env var) is also converted."""
        from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
        from core.push import _normalize_vapid_private_key

        key = self._gen_key()
        pem = key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()).decode()
        pem_escaped = pem.replace("\n", "\\n")

        result = _normalize_vapid_private_key(pem_escaped)

        assert result == self._raw_b64(key)

    def test_vapid_pem_round_trip_and_reusability(self):
        """Generate a real EC P-256 key pair, normalize PEM → raw, then re-derive
        the public key from the normalized private key and verify it matches.
        Uses cryptography's own key generation (named curve, no explicit params)
        rather than py_vapid which may generate explicit-param keys unsupported by
        load_pem_private_key.
        """
        from cryptography.hazmat.primitives.asymmetric.ec import (
            SECP256R1,
            derive_private_key,
            generate_private_key,
        )
        from cryptography.hazmat.primitives.serialization import (
            Encoding, NoEncryption, PrivateFormat, PublicFormat,
        )

        from core.push import _normalize_vapid_private_key

        key = generate_private_key(SECP256R1())
        pem = key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption()).decode()

        normalized = _normalize_vapid_private_key(pem)

        # Decode normalized → raw bytes → reconstruct private key
        raw_bytes = base64.urlsafe_b64decode(normalized + "==")
        assert len(raw_bytes) == 32, "EC P-256 private key must be exactly 32 bytes"

        reconstructed = derive_private_key(int.from_bytes(raw_bytes, "big"), SECP256R1())

        # Re-derive public key and compare to the original
        original_pub = key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        reconstructed_pub = reconstructed.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        assert reconstructed_pub == original_pub, "Re-derived public key must match original"

    def test_pkcs8_pem_round_trip(self):
        """PKCS#8 PEM (-----BEGIN PRIVATE KEY-----) is also handled correctly."""
        from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
        from core.push import _normalize_vapid_private_key

        key = self._gen_key()
        pem_pkcs8 = key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()

        result = _normalize_vapid_private_key(pem_pkcs8)

        assert result == self._raw_b64(key)


def _make_sub(db, user_id: int, endpoint: str = "https://push.example.com/sub") -> PushSubscription:
    sub = PushSubscription(user_id=user_id, endpoint=endpoint, p256dh="p256dh", auth="authkey")
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def _make_user(db, club_id: int, email: str = "u@test.de", regular_member_id: int | None = None) -> User:
    from core.security import get_password_hash
    u = User(
        email=email,
        name="U",
        hashed_password=get_password_hash("pw"),
        role=UserRole.member,
        club_id=club_id,
        is_active=True,
        regular_member_id=regular_member_id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# ---------------------------------------------------------------------------
# _send_one
# ---------------------------------------------------------------------------

class TestSendOne:
    def test_calls_webpush_with_correct_args(self, db, user, subscription):
        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch.object(settings, "VAPID_CLAIM_EMAIL", "admin@test.de"), \
             patch("pywebpush.webpush") as mock_wp:
            from core.push import _send_one
            _send_one(db, subscription, "Title", "Body", "/some/url")

        mock_wp.assert_called_once()
        kwargs = mock_wp.call_args.kwargs
        assert kwargs["subscription_info"]["endpoint"] == subscription.endpoint
        import json
        data = json.loads(kwargs["data"])
        assert data["title"] == "Title"
        assert data["body"] == "Body"
        assert data["url"] == "/some/url"
        assert "mailto:admin@test.de" in kwargs["vapid_claims"]["sub"]

    def test_restores_newlines_in_private_key(self, db, user, subscription):
        """Env vars store \\n as literal backslash-n; _send_one must restore them."""
        with patch.object(settings, "VAPID_PRIVATE_KEY", "line1\\nline2"), \
             patch("pywebpush.webpush") as mock_wp:
            from core.push import _send_one
            _send_one(db, subscription, "T", "B")

        key_used = mock_wp.call_args.kwargs["vapid_private_key"]
        assert key_used == "line1\nline2"

    def test_deletes_subscription_on_410(self, db, user, club):
        """A 410 Gone response means the endpoint is stale — subscription must be deleted."""
        sub = _make_sub(db, user.id, endpoint="https://push.example.com/gone-endpoint")

        mock_response = MagicMock()
        mock_response.status_code = 410

        from pywebpush import WebPushException
        exc = WebPushException("Gone", response=mock_response)

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("pywebpush.webpush", side_effect=exc):
            from core.push import _send_one
            _send_one(db, sub, "T", "B")

        db.expire_all()
        assert db.query(PushSubscription).filter(PushSubscription.id == sub.id).first() is None

    def test_deletes_subscription_on_404(self, db, user, club):
        """A 404 response also means stale endpoint."""
        sub = _make_sub(db, user.id, endpoint="https://push.example.com/notfound-endpoint")

        mock_response = MagicMock()
        mock_response.status_code = 404
        from pywebpush import WebPushException
        exc = WebPushException("Not Found", response=mock_response)

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("pywebpush.webpush", side_effect=exc):
            from core.push import _send_one
            _send_one(db, sub, "T", "B")

        db.expire_all()
        assert db.query(PushSubscription).filter(PushSubscription.id == sub.id).first() is None

    def test_keeps_subscription_on_other_error(self, db, user, club):
        """Non-404/410 errors are silently logged; subscription is NOT deleted."""
        sub = _make_sub(db, user.id, endpoint="https://push.example.com/server-error")

        mock_response = MagicMock()
        mock_response.status_code = 500
        from pywebpush import WebPushException
        exc = WebPushException("Server Error", response=mock_response)

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("pywebpush.webpush", side_effect=exc):
            from core.push import _send_one
            _send_one(db, sub, "T", "B")

        db.expire_all()
        assert db.query(PushSubscription).filter(PushSubscription.id == sub.id).first() is not None

        db.delete(sub)
        db.commit()

    def test_handles_generic_exception_gracefully(self, db, user, subscription):
        """Any unexpected exception must be swallowed (just logged)."""
        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("pywebpush.webpush", side_effect=RuntimeError("network gone")):
            from core.push import _send_one
            _send_one(db, subscription, "T", "B")  # must not raise


# ---------------------------------------------------------------------------
# push_to_regular_member
# ---------------------------------------------------------------------------

class TestPushToRegularMember:
    def test_noop_when_vapid_not_configured(self, db, user, club):
        with patch.object(settings, "VAPID_PRIVATE_KEY", ""), \
             patch("core.push._send_one") as mock_send:
            from core.push import push_to_regular_member
            push_to_regular_member(db, 999, "T", "B")
        mock_send.assert_not_called()

    def test_sends_to_all_user_subscriptions(self, db, club):
        u = _make_user(db, club.id, email="rm@test.de", regular_member_id=42)
        sub1 = _make_sub(db, u.id, endpoint="https://push.example.com/rm-a")
        sub2 = _make_sub(db, u.id, endpoint="https://push.example.com/rm-b")

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("core.push._send_one") as mock_send:
            from core.push import push_to_regular_member
            push_to_regular_member(db, 42, "Title", "Body", "/url")

        assert mock_send.call_count == 2
        endpoints_called = {c.args[1].endpoint for c in mock_send.call_args_list}
        assert endpoints_called == {sub1.endpoint, sub2.endpoint}

        db.delete(sub1)
        db.delete(sub2)
        db.delete(u)
        db.commit()

    def test_does_not_send_to_other_regular_member(self, db, club):
        u_other = _make_user(db, club.id, email="other_rm@test.de", regular_member_id=99)
        sub_other = _make_sub(db, u_other.id, endpoint="https://push.example.com/other-rm")

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("core.push._send_one") as mock_send:
            from core.push import push_to_regular_member
            push_to_regular_member(db, 42, "T", "B")  # different regular_member_id

        mock_send.assert_not_called()

        db.delete(sub_other)
        db.delete(u_other)
        db.commit()

    def test_skips_inactive_users(self, db, club):
        inactive = _make_user(db, club.id, email="inactive_rm@test.de", regular_member_id=77)
        inactive.is_active = False
        db.commit()
        _make_sub(db, inactive.id, endpoint="https://push.example.com/inactive-rm")

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("core.push._send_one") as mock_send:
            from core.push import push_to_regular_member
            push_to_regular_member(db, 77, "T", "B")

        mock_send.assert_not_called()

        db.query(PushSubscription).filter(PushSubscription.user_id == inactive.id).delete()
        db.delete(inactive)
        db.commit()


# ---------------------------------------------------------------------------
# push_to_club
# ---------------------------------------------------------------------------

class TestPushToClub:
    # push_to_club uses ThreadPoolExecutor + _send_one_no_db (not _send_one)
    def test_noop_when_vapid_not_configured(self, db, club):
        with patch.object(settings, "VAPID_PRIVATE_KEY", ""), \
             patch("core.push._send_one_no_db") as mock_send:
            from core.push import push_to_club
            push_to_club(db, club.id, "T", "B")
        mock_send.assert_not_called()

    def test_sends_to_all_club_subscribers(self, db, club):
        u1 = _make_user(db, club.id, email="club1@test.de")
        u2 = _make_user(db, club.id, email="club2@test.de")
        sub1 = _make_sub(db, u1.id, endpoint="https://push.example.com/club-u1")
        sub2 = _make_sub(db, u2.id, endpoint="https://push.example.com/club-u2")

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("core.push._send_one_no_db", return_value=None) as mock_send:
            from core.push import push_to_club
            push_to_club(db, club.id, "ClubTitle", "ClubBody")

        assert mock_send.call_count == 2

        db.delete(sub1)
        db.delete(sub2)
        db.delete(u1)
        db.delete(u2)
        db.commit()

    def test_does_not_send_to_other_club(self, db, club):
        other_club = from_db_add_club(db, "Other Club", "other-slug")
        u_other = _make_user(db, other_club.id, email="other_club@test.de")
        sub_other = _make_sub(db, u_other.id, endpoint="https://push.example.com/other-club")

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("core.push._send_one_no_db", return_value=None) as mock_send:
            from core.push import push_to_club
            push_to_club(db, club.id, "T", "B")

        mock_send.assert_not_called()

        db.delete(sub_other)
        db.delete(u_other)
        db.delete(other_club)
        db.commit()

    def test_skips_inactive_club_members(self, db, club):
        inactive = _make_user(db, club.id, email="inactive_club@test.de")
        inactive.is_active = False
        db.commit()
        _make_sub(db, inactive.id, endpoint="https://push.example.com/inactive-club")

        with patch.object(settings, "VAPID_PRIVATE_KEY", FAKE_PRIVATE_KEY), \
             patch("core.push._send_one_no_db", return_value=None) as mock_send:
            from core.push import push_to_club
            push_to_club(db, club.id, "T", "B")

        mock_send.assert_not_called()

        db.query(PushSubscription).filter(PushSubscription.user_id == inactive.id).delete()
        db.delete(inactive)
        db.commit()


def from_db_add_club(db, name: str, slug: str):
    from models.club import Club
    c = Club(name=name, slug=slug)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

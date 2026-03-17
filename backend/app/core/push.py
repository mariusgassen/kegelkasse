"""Web Push notification helpers. Silently no-ops if VAPID keys are not configured."""
import json
import logging

from sqlalchemy.orm import Session

from core.config import settings
from models.push import PushSubscription
from models.user import User

logger = logging.getLogger(__name__)


def _normalize_vapid_private_key(raw: str) -> str:
    """Return the VAPID private key as raw base64url for pywebpush.

    Handles all storage formats used in practice:
    - Raw base64url EC key (no PEM headers) — returned as-is
    - PEM with literal \\n (Coolify / Docker env vars)
    - PEM with real newlines (multi-line value)

    PEM keys are converted to raw base64url (32-byte EC scalar) to avoid
    ASN.1 parsing errors from malformed line breaks or unsupported encodings.
    """
    import base64

    key = raw.strip().replace("\\n", "\n")
    if "-----BEGIN" not in key:
        return key  # already raw base64url — pywebpush accepts this directly

    # Convert PEM → raw base64url to sidestep all ASN.1 / line-wrap issues.
    # We extract the raw EC private scalar via private_numbers(), which is
    # compatible across all cryptography versions (no Encoding.Raw needed).
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    key_obj = load_pem_private_key(key.encode(), password=None)
    d = key_obj.private_numbers().private_value  # integer EC scalar
    raw_bytes = d.to_bytes(32, "big")
    return base64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode()


def _send_one(db: Session, sub: PushSubscription, title: str, body: str, url: str = '/') -> None:
    """Send a single push and silently absorb failures (stale subs are auto-removed)."""
    try:
        _send_one_raising(db, sub, title, body, url)
    except Exception as exc:
        logger.warning("Push send failed for sub %s: %s", sub.id, exc, exc_info=True)


def _send_one_raising(db: Session, sub: PushSubscription, title: str, body: str, url: str = '/') -> None:
    """Send a single push; raises on failure (use for test/debug paths)."""
    from pywebpush import WebPushException, webpush
    private_key = _normalize_vapid_private_key(settings.VAPID_PRIVATE_KEY)
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=private_key,
            vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"},
        )
    except WebPushException as exc:
        if exc.response and exc.response.status_code in (404, 410):
            db.delete(sub)
            db.commit()
        raise


def push_to_regular_member(db: Session, regular_member_id: int, title: str, body: str, url: str = '/') -> None:
    """Send push to every subscriber linked to a regular member."""
    if not settings.VAPID_PRIVATE_KEY:
        return
    users = db.query(User).filter(User.regular_member_id == regular_member_id, User.is_active == True).all()
    for user in users:
        for sub in db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all():
            _send_one(db, sub, title, body, url)


def push_to_club(db: Session, club_id: int, title: str, body: str, url: str = '/') -> None:
    """Send push to every subscriber in a club."""
    if not settings.VAPID_PRIVATE_KEY:
        return
    users = db.query(User).filter(User.club_id == club_id, User.is_active == True).all()
    for user in users:
        for sub in db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all():
            _send_one(db, sub, title, body, url)


def push_to_club_admins(db: Session, club_id: int, title: str, body: str, url: str = '/') -> None:
    """Send push to all admin/superadmin subscribers in a club."""
    if not settings.VAPID_PRIVATE_KEY:
        return
    from models.user import UserRole
    users = db.query(User).filter(
        User.club_id == club_id,
        User.is_active == True,
        User.role.in_([UserRole.admin, UserRole.superadmin]),
    ).all()
    for user in users:
        for sub in db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all():
            _send_one(db, sub, title, body, url)

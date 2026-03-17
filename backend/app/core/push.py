"""Web Push notification helpers. Silently no-ops if VAPID keys are not configured."""
import json
import logging

from sqlalchemy.orm import Session

from core.config import settings
from models.push import PushSubscription
from models.user import User

logger = logging.getLogger(__name__)


def _send_one(db: Session, sub: PushSubscription, title: str, body: str, url: str = '/') -> None:
    """Send a single push and silently absorb failures (stale subs are auto-removed)."""
    try:
        _send_one_raising(db, sub, title, body, url)
    except Exception as exc:
        logger.warning("Push send failed for sub %s: %s", sub.id, exc, exc_info=True)


def _send_one_raising(db: Session, sub: PushSubscription, title: str, body: str, url: str = '/') -> None:
    """Send a single push; raises on failure (use for test/debug paths)."""
    from pywebpush import WebPushException, webpush
    # Env vars store PEM newlines as literal \n — restore them before use
    private_key = settings.VAPID_PRIVATE_KEY.replace("\\n", "\n")
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

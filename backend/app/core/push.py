"""Web Push notification helpers. Silently no-ops if VAPID keys are not configured."""
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy.orm import Session

from core.config import settings
from models.push import NotificationLog, PushSubscription
from models.user import User

logger = logging.getLogger(__name__)


def _normalize_vapid_private_key(raw: str) -> str:
    """Return the VAPID private key as raw base64url for pywebpush.

    Handles all storage formats used in practice:
    - Raw base64url EC key (no PEM headers) — returned as-is
    - PEM with literal \\n (Coolify / Docker env vars)
    - PEM with real newlines (multi-line value)
    - PEM with a leading EC PARAMETERS block (some py-vapid versions prepend it)

    PEM keys are converted to raw base64url (32-byte EC scalar) to avoid
    ASN.1 parsing errors from malformed line breaks or unsupported encodings.
    """
    import base64
    import re

    key = raw.strip().replace("\\n", "\n")
    if "-----BEGIN" not in key:
        return key  # already raw base64url — pywebpush accepts this directly

    # Some py-vapid versions prepend an "EC PARAMETERS" block before the private key.
    # load_pem_private_key only accepts a single key block, so strip everything
    # before the first "BEGIN EC PRIVATE KEY" or "BEGIN PRIVATE KEY" header.
    match = re.search(r"-----BEGIN (EC |)PRIVATE KEY-----.*?-----END (EC |)PRIVATE KEY-----", key, re.DOTALL)
    if match:
        key = match.group(0)

    # Convert PEM → raw base64url to sidestep all ASN.1 / line-wrap issues.
    # We extract the raw EC private scalar via private_numbers(), which is
    # compatible across all cryptography versions (no Encoding.Raw needed).
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    key_obj = load_pem_private_key(key.encode(), password=None)
    d = key_obj.private_numbers().private_value  # integer EC scalar
    raw_bytes = d.to_bytes(32, "big")
    return base64.urlsafe_b64encode(raw_bytes).rstrip(b"=").decode()


def _send_one(db: Session, sub: PushSubscription, title: str, body: str, url: str = '/',
              extra: dict | None = None) -> None:
    """Send a single push and silently absorb failures (stale subs are auto-removed)."""
    try:
        _send_one_raising(db, sub, title, body, url, extra=extra)
    except Exception as exc:
        logger.warning("Push send failed for sub %s: %s", sub.id, exc, exc_info=True)


def _send_one_raising(db: Session, sub: PushSubscription, title: str, body: str, url: str = '/',
                      extra: dict | None = None) -> None:
    """Send a single push; raises on failure (use for test/debug paths)."""
    from pywebpush import WebPushException, webpush
    private_key = _normalize_vapid_private_key(settings.VAPID_PRIVATE_KEY)
    payload: dict = {"title": title, "body": body, "url": url}
    if extra:
        payload.update(extra)
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"},
        )
    except WebPushException as exc:
        if exc.response and exc.response.status_code in (404, 410):
            db.delete(sub)
            db.commit()
        raise


# The concrete delivery channels a category can fan out to. A category's
# preference is a *subset* of these (possibly empty = off).
CHANNELS = ("push", "email")


def resolve_channels(value, default: tuple[str, ...] = ("push",)) -> list[str]:
    """Normalize any stored preference value to a list of channels (subset of push/email).

    A user can enable several channels for one category at once (e.g. both push
    and email). The stored/wire representation is therefore a list of channels;
    an empty list means the category is off.

    Backwards compatible with every earlier representation:
    - None / missing       → ``default``
    - bool True / False     → ``['push']`` / ``[]``  (pre-channel booleans)
    - str 'off'             → ``[]``
    - str 'push' / 'email'  → ``['push']`` / ``['email']``  (single-channel era)
    - list of channels      → filtered & de-duped to valid channels
    """
    if value is None:
        return list(default)
    if isinstance(value, bool):
        return ["push"] if value else []
    if isinstance(value, str):
        if value == "off":
            return []
        if value in CHANNELS:
            return [value]
        return list(default)
    if isinstance(value, (list, tuple, set)):
        return [c for c in CHANNELS if c in value]
    return list(default)


def _user_channels(user: User, category: str, default: tuple[str, ...] = ("push",)) -> list[str]:
    """Return the enabled delivery channels (subset of push/email) for a category."""
    if not category:
        return list(default)
    prefs = user.push_preferences or {}
    return resolve_channels(prefs.get(category), default)


def _user_wants(user: User, category: str) -> bool:
    """Return True if the user has this notification category enabled (any channel on)."""
    return bool(_user_channels(user, category))


def _club_email_config(db: Session, club_id: int | None, cache: dict) -> dict | None:
    """Resolve (and cache) the SMTP config for a club id within one dispatch call."""
    if club_id is None:
        return None
    if club_id in cache:
        return cache[club_id]
    from core.email import get_club_email_config
    from models.club import Club
    club = db.query(Club).filter(Club.id == club_id).first()
    cfg = get_club_email_config(club) if club else None
    cache[club_id] = cfg
    return cfg


def _log_notification(db: Session, user_id: int, title: str, body: str, url: str) -> None:
    """Persist a notification to the server-side log (best-effort, never raises)."""
    try:
        db.add(NotificationLog(user_id=user_id, title=title, body=body, url=url))
        db.commit()
    except Exception as exc:
        logger.warning("Failed to save notification log for user %s: %s", user_id, exc)
        db.rollback()


def notify_user(db: Session, user: User, title: str, body: str, url: str = '/',
                category: str = '', extra: dict | None = None,
                email_cache: dict | None = None) -> bool:
    """Deliver one notification to one user, honouring their per-category channels.

    A category may have several channels enabled at once:
    - no channels → nothing (no log, no delivery)
    - 'push'      → Web Push (if configured)
    - 'email'     → email via the user's club SMTP (if configured)

    The in-app bell is always fed (a log row) whenever at least one channel is on.
    Returns True if the notification was logged/delivered (any channel on).
    """
    channels = _user_channels(user, category)
    if not channels:
        return False
    # Always log so the in-app bell shows it, regardless of channel(s).
    _log_notification(db, user.id, title, body, url)
    if "email" in channels:
        from core.email import email_theme, send_notification_email
        cfg = _club_email_config(db, user.club_id, email_cache if email_cache is not None else {})
        if cfg:
            send_notification_email(cfg, user.email, title, body, url,
                                    theme=email_theme(user.club), locale=user.preferred_locale)
    if "push" in channels and settings.VAPID_PRIVATE_KEY:
        for sub in db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all():
            _send_one(db, sub, title, body, url, extra=extra)
    return True


def push_to_regular_member(db: Session, regular_member_id: int, title: str, body: str,
                            url: str = '/', category: str = '', extra: dict | None = None) -> None:
    """Notify every user linked to a regular member (push or email per their preference)."""
    users = db.query(User).filter(User.regular_member_id == regular_member_id, User.is_active == True).all()
    email_cache: dict = {}
    for user in users:
        notify_user(db, user, title, body, url, category=category, extra=extra, email_cache=email_cache)


def _send_one_no_db(sub: PushSubscription, title: str, body: str, url: str,
                    extra: dict | None) -> int | None:
    """Send push without DB access; return sub.id if it should be deleted (410/404)."""
    from pywebpush import WebPushException, webpush
    private_key = _normalize_vapid_private_key(settings.VAPID_PRIVATE_KEY)
    payload: dict = {"title": title, "body": body, "url": url}
    if extra:
        payload.update(extra)
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps(payload),
            vapid_private_key=private_key,
            vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"},
        )
    except WebPushException as exc:
        if exc.response and exc.response.status_code in (404, 410):
            return sub.id
        logger.warning("Push send failed for sub %s: %s", sub.id, exc, exc_info=True)
    except Exception as exc:
        logger.warning("Push send failed for sub %s: %s", sub.id, exc, exc_info=True)
    return None


def push_to_club(db: Session, club_id: int, title: str, body: str,
                 url: str = '/', category: str = '', extra: dict | None = None) -> None:
    """Notify every member of a club — Web Push (parallelised) or email, per preference."""
    users = db.query(User).filter(User.club_id == club_id, User.is_active == True).all()
    email_cache: dict = {}
    subs = []
    for user in users:
        channels = _user_channels(user, category)
        if not channels:
            continue
        # Always log for hybrid loading / in-app bell
        _log_notification(db, user.id, title, body, url)
        if "email" in channels:
            from core.email import email_theme, send_notification_email
            cfg = _club_email_config(db, user.club_id, email_cache)
            if cfg:
                send_notification_email(cfg, user.email, title, body, url,
                                        theme=email_theme(user.club), locale=user.preferred_locale)
        if "push" in channels and settings.VAPID_PRIVATE_KEY:
            subs.extend(db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all())
    if not subs:
        return
    stale_ids: list[int] = []
    with ThreadPoolExecutor(max_workers=min(len(subs), 20)) as pool:
        futures = {pool.submit(_send_one_no_db, sub, title, body, url, extra): sub for sub in subs}
        for f in as_completed(futures):
            result = f.result()
            if result is not None:
                stale_ids.append(result)
    # Remove stale subscriptions in the main thread (DB-safe)
    if stale_ids:
        db.query(PushSubscription).filter(PushSubscription.id.in_(stale_ids)).delete(synchronize_session=False)
        db.commit()


def push_to_user(db: Session, user_id: int, title: str, body: str,
                 url: str = '/', category: str = '', extra: dict | None = None) -> None:
    """Notify a single user by user ID (push or email per their preference)."""
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        return
    notify_user(db, user, title, body, url, category=category, extra=extra)


def push_to_club_admins(db: Session, club_id: int, title: str, body: str,
                        url: str = '/', category: str = '', extra: dict | None = None) -> None:
    """Notify all admin/superadmin members of a club (push or email per preference)."""
    from models.user import UserRole
    users = db.query(User).filter(
        User.club_id == club_id,
        User.is_active == True,
        User.role.in_([UserRole.admin, UserRole.superadmin]),
    ).all()
    email_cache: dict = {}
    for user in users:
        notify_user(db, user, title, body, url, category=category, extra=extra, email_cache=email_cache)

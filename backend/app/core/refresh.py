"""Rotating refresh-token sessions.

The access token stays a short-lived, stateless JWT — it is what every request
carries, and nothing can revoke it before it expires. The refresh token is the
opposite: an opaque random string backed by a database row, so it *can* be
revoked (logout, password change, deactivation) and it is what actually keeps a
member logged in between Kegelabende.

Two properties are worth spelling out, because they are the reason this is a
database table rather than a second JWT:

**Rotation.** Every refresh consumes the presented token and mints a successor.
A token therefore has a single legitimate use; a copy someone else took is only
useful until the real client refreshes once.

**Reuse detection.** Presenting an already-rotated token means two parties hold
the same secret — the real client and a thief, and there is no way to tell which
one is asking. The whole ``family_id`` lineage is revoked, so the theft costs an
attacker the session instead of granting one. The exception is a short grace
window: a client that fires two refreshes at once (two tabs, a retried request)
is not an attacker, so within ``REFRESH_REUSE_GRACE_SECONDS`` the second call is
served normally instead of logging the member out.
"""
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, UTC
from typing import Optional

from sqlalchemy.orm import Session

from core.config import settings
from models.user import RefreshToken, User

logger = logging.getLogger(__name__)


def generate_refresh_token() -> str:
    """A fresh opaque token. 48 bytes of urandom — not a JWT, nothing to parse."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw: str) -> str:
    """SHA-256 hex of the raw token — the only form that reaches the database.

    Plain SHA-256 (rather than bcrypt, as for passwords) is the right tool here:
    the input is 48 bytes of urandom, so there is no dictionary to attack and no
    reason to pay a work factor on every request.
    """
    return hashlib.sha256(raw.encode()).hexdigest()


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Normalise a stored timestamp to tz-aware UTC.

    Some backends hand back tz-aware columns as naive datetimes on round-trip,
    which would make any comparison against ``datetime.now(UTC)`` raise.
    """
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def issue_refresh_token(db: Session, user: User, *, family_id: Optional[str] = None,
                        user_agent: Optional[str] = None, commit: bool = True) -> str:
    """Mint a refresh token for ``user`` and persist its hash.

    Pass ``family_id`` to continue an existing login lineage (rotation); omit it
    to start a new one (fresh login, registration).
    """
    raw = generate_refresh_token()
    row = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw),
        family_id=family_id or str(uuid.uuid4()),
        user_agent=(user_agent or "")[:255] or None,
        expires_at=datetime.now(UTC) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(row)
    if commit:
        db.commit()
    else:
        db.flush()
    return raw


def revoke_family(db: Session, family_id: str, *, commit: bool = True) -> int:
    """Revoke every still-live token in a login lineage. Returns the row count."""
    now = datetime.now(UTC)
    rows = (db.query(RefreshToken)
            .filter(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .all())
    for row in rows:
        row.revoked_at = now
    if commit:
        db.commit()
    return len(rows)


def revoke_all_for_user(db: Session, user_id: int, *, commit: bool = True) -> int:
    """Log a user out everywhere — password change, reset, deactivation."""
    now = datetime.now(UTC)
    rows = (db.query(RefreshToken)
            .filter(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .all())
    for row in rows:
        row.revoked_at = now
    if commit:
        db.commit()
    if rows:
        logger.info("Revoked %d refresh token(s) for user_id=%s", len(rows), user_id)
    return len(rows)


def revoke_refresh_token(db: Session, raw: str, *, commit: bool = True) -> bool:
    """Revoke a single token (logout on this device). Idempotent."""
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(raw)).first()
    if not row:
        return False
    if row.revoked_at is None:
        row.revoked_at = datetime.now(UTC)
        if commit:
            db.commit()
    return True


def rotate_refresh_token(db: Session, raw: str, *,
                         user_agent: Optional[str] = None) -> Optional[tuple[User, str]]:
    """Exchange a refresh token for its successor.

    Returns ``(user, new_raw_token)``, or ``None`` when the token is unknown,
    expired, revoked outside the grace window, or belongs to an account that can
    no longer sign in. A ``None`` return is always a 401 for the caller — it
    never distinguishes the reasons, since the client can act on none of them.
    """
    now = datetime.now(UTC)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == hash_refresh_token(raw)).first()
    if not row:
        return None

    if _as_utc(row.expires_at) <= now:
        return None

    # Explicitly revoked — logout, password change, deactivation, or a family
    # taken down by reuse detection. No grace: revoked means revoked.
    if row.revoked_at is not None:
        return None

    if row.rotated_at is not None:
        grace = timedelta(seconds=settings.REFRESH_REUSE_GRACE_SECONDS)
        if now - _as_utc(row.rotated_at) > grace:
            # Outside the grace window this is a replay: the legitimate client
            # already moved on, so whoever is asking now holds a copy. Take the
            # whole lineage down rather than guess which side is genuine.
            revoked = revoke_family(db, row.family_id)
            logger.warning(
                "Refresh token reuse detected for user_id=%s family=%s — revoked %d token(s)",
                row.user_id, row.family_id, revoked,
            )
            return None
        # Inside the window: a double-fired refresh from the same client
        # (two tabs, a retry). Serve it instead of logging the member out.
        logger.info("Refresh token replay within grace window for user_id=%s", row.user_id)

    user = db.query(User).filter(User.id == row.user_id).first()
    if not user or not user.is_active:
        return None

    row.rotated_at = row.rotated_at or now
    new_raw = issue_refresh_token(db, user, family_id=row.family_id,
                                  user_agent=user_agent, commit=False)
    db.commit()
    return user, new_raw


def purge_expired(db: Session, *, keep_revoked_for_days: int = 30) -> int:
    """Delete rows that can no longer authorise anything.

    Expired tokens go immediately; revoked and rotated ones linger briefly so
    that reuse detection still has something to match a late replay against.
    """
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=keep_revoked_for_days)
    deleted = (db.query(RefreshToken)
               .filter((RefreshToken.expires_at <= now)
                       | (RefreshToken.revoked_at <= cutoff)
                       | (RefreshToken.rotated_at <= cutoff))
               .delete(synchronize_session=False))
    db.commit()
    if deleted:
        logger.info("Purged %d expired/revoked refresh token(s)", deleted)
    return deleted

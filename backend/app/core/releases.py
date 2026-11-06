"""Release announcement push.

A release is announced from the deployed server itself, not from CI: release-please
publishes the GitHub release the moment the release PR merges, but Coolify is only then
starting to build the new image. A push sent from the workflow would arrive while the old
version is still being served, and tapping it would load the old app again.

So each server start compares its own version with the last announced one (``app_state``)
and, if it is newer, notifies every member who opted into the ``app_updates`` category.
The version only changes when a release PR merges, so ordinary merges to main never
announce anything, and restarts, redeploys and rollbacks of the same or an older version
stay silent.
"""
import logging
import tomllib
from pathlib import Path

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from core.i18n import t
from core.push import _user_wants, notify_user
from models.app_state import AppState
from models.user import User

logger = logging.getLogger(__name__)

CATEGORY = "app_updates"
ANNOUNCED_KEY = "announced_version"
# Tapping the notification opens this URL; the service worker sees ``update`` in the
# payload and activates the new worker before opening it.
RELEASE_URL = "/"

_PYPROJECT = Path(__file__).resolve().parents[2] / "pyproject.toml"


def current_version() -> str:
    with open(_PYPROJECT, "rb") as f:
        return tomllib.load(f)["tool"]["poetry"]["version"]


def parse_version(value: str) -> tuple[int, ...] | None:
    """``"1.70.1"`` → ``(1, 70, 1)``; anything unparsable → None."""
    try:
        return tuple(int(part) for part in value.strip().lstrip("v").split("."))
    except (AttributeError, ValueError):
        return None


def claim_release(db: Session, version: str) -> bool:
    """Record ``version`` as announced; True only if it is newer than the last one.

    The first run on an instance only records a baseline, so turning the feature on (or a
    fresh install) does not announce whatever version happens to be running. The row is
    locked while compared, so two workers starting together announce once.
    """
    new = parse_version(version)
    if new is None:
        return False
    row = db.query(AppState).filter(AppState.key == ANNOUNCED_KEY).with_for_update().first()
    if row is None:
        db.add(AppState(key=ANNOUNCED_KEY, value=version))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        return False
    old = parse_version(row.value)
    if old is not None and new <= old:
        db.rollback()
        return False
    row.value = version
    db.commit()
    return True


def announce_release(db: Session, version: str) -> int:
    """Notify every opted-in active member about ``version``; returns how many were notified."""
    if not claim_release(db, version):
        return 0
    users = db.query(User).filter(User.is_active == True).all()  # noqa: E712
    sent = 0
    email_cache: dict = {}
    telegram_cache: dict = {}
    for user in users:
        if not _user_wants(user, CATEGORY):
            continue
        locale = user.preferred_locale
        notify_user(
            db, user,
            t(locale, "release.push.title", version=version),
            t(locale, "release.push.body", version=version),
            RELEASE_URL,
            category=CATEGORY,
            extra={"update": True, "tag": "kegelkasse-release"},
            email_cache=email_cache, telegram_cache=telegram_cache,
        )
        sent += 1
    logger.info("Announced release %s to %d member(s)", version, sent)
    return sent

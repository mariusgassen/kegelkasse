"""Profile pictures: stored as files (``avatars/<key>``) instead of base64 data URIs in ``user.avatar``."""
from __future__ import annotations

import base64
import binascii
import hashlib
import re
from typing import Optional

from core.storage import get_storage, url_for_key

MAX_AVATAR_BYTES = 2 * 1024 * 1024
_DATA_URI_RE = re.compile(r"^data:(image/(?:jpeg|png|webp|gif));base64,(.+)$", re.DOTALL)
_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


class InvalidAvatar(ValueError):
    pass


def is_data_uri(value: Optional[str]) -> bool:
    return bool(value) and value.startswith("data:")


def decode_data_uri(value: str) -> tuple[bytes, str]:
    m = _DATA_URI_RE.match(value.strip())
    if not m:
        raise InvalidAvatar("Unsupported avatar format")
    try:
        data = base64.b64decode(m.group(2), validate=False)
    except (binascii.Error, ValueError) as exc:
        raise InvalidAvatar("Invalid base64 avatar") from exc
    if not data:
        raise InvalidAvatar("Empty avatar")
    if len(data) > MAX_AVATAR_BYTES:
        raise InvalidAvatar("Avatar too large")
    return data, m.group(1)


def avatar_key(user_id: int, data: bytes, content_type: str) -> str:
    """Deterministic per content, so re-running the migration writes the same object again."""
    digest = hashlib.sha256(data).hexdigest()[:24]
    return f"avatars/avatar_{user_id}_{digest}.{_EXT[content_type]}"


def store_avatar(user_id: int, data_uri: str, storage=None) -> str:
    """Write the image behind ``data_uri`` to storage and return its ``/uploads/...`` URL."""
    data, content_type = decode_data_uri(data_uri)
    key = avatar_key(user_id, data, content_type)
    (storage or get_storage()).put(key, data, content_type)
    return url_for_key(key)

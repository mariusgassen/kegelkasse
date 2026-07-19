"""Symmetric encryption for secrets stored at rest (e.g. per-club SMTP passwords).

Uses Fernet (AES-128-CBC + HMAC) from the already-present ``cryptography``
package, wrapped in ``MultiFernet`` to support **key rotation**:

- ``SECRETS_ENCRYPTION_KEY`` is a comma-separated list of Fernet keys. The
  **first** key encrypts new secrets; **all** keys are tried when decrypting.
- To rotate: generate a new key, prepend it, and keep the old one, e.g.
  ``SECRETS_ENCRYPTION_KEY=<new>,<old>``. New writes use ``<new>``; existing
  ciphertexts still decrypt with ``<old>`` and migrate to ``<new>`` the next
  time they are saved. Once nothing decrypts with ``<old>`` you can drop it.
- Generate a key with ``python app/scripts/generate_secret_key.py``.

When ``SECRETS_ENCRYPTION_KEY`` is empty, a key is derived from ``SECRET_KEY``
so encryption works out of the box (with the caveat that rotating
``SECRET_KEY`` would then invalidate stored secrets).

Encrypted values carry an ``enc:v1:`` prefix. ``decrypt_secret`` treats any
value without that prefix as legacy plaintext and returns it unchanged, so
pre-existing plaintext secrets keep working and get encrypted the next time
they are saved.
"""
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from core.config import settings

logger = logging.getLogger(__name__)

_ENC_PREFIX = "enc:v1:"


def _load_fernet() -> MultiFernet:
    """Build a MultiFernet from the configured key list, or a SECRET_KEY-derived key.

    Read fresh each call (no module-level cache) so config/env changes and test
    overrides of ``settings`` take effect without a restart.
    """
    keys: list[Fernet] = []
    raw = (settings.SECRETS_ENCRYPTION_KEY or "").strip()
    if raw:
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                keys.append(Fernet(part))
            except (ValueError, TypeError):
                logger.warning("Ignoring invalid SECRETS_ENCRYPTION_KEY entry")
    if not keys:
        # Fallback: derive a stable Fernet key from SECRET_KEY.
        derived = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        keys.append(Fernet(derived))
    return MultiFernet(keys)


def is_encrypted(value: str) -> bool:
    return bool(value) and value.startswith(_ENC_PREFIX)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret for storage using the primary key. Empty input returns empty."""
    if not plaintext:
        return ""
    token = _load_fernet().encrypt(plaintext.encode()).decode()
    return _ENC_PREFIX + token


def decrypt_secret(value: str) -> str:
    """Decrypt a stored secret, trying every configured key. Non-prefixed → plaintext."""
    if not value:
        return ""
    if not value.startswith(_ENC_PREFIX):
        return value  # legacy plaintext — transparent fallback
    token = value[len(_ENC_PREFIX):]
    try:
        return _load_fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        logger.warning("Failed to decrypt stored secret (no matching key?); treating as empty")
        return ""

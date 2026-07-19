"""Symmetric encryption for secrets stored at rest (e.g. per-club SMTP passwords).

Uses Fernet (AES-128-CBC + HMAC) from the already-present ``cryptography``
package. The key is derived deterministically from ``SECRET_KEY`` so no extra
configuration is required — rotating ``SECRET_KEY`` invalidates stored secrets
(they must be re-entered), which is the expected behaviour for a signing key.

Encrypted values carry an ``enc:v1:`` prefix. ``decrypt_secret`` treats any
value without that prefix as legacy plaintext and returns it unchanged, so
existing plaintext secrets keep working and get encrypted the next time they
are saved.
"""
import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from core.config import settings

logger = logging.getLogger(__name__)

_ENC_PREFIX = "enc:v1:"


def _fernet() -> Fernet:
    # SHA-256 of SECRET_KEY → 32 raw bytes → urlsafe base64 = a valid Fernet key.
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
    return Fernet(key)


def is_encrypted(value: str) -> bool:
    return bool(value) and value.startswith(_ENC_PREFIX)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret for storage. Empty input returns empty (nothing to store)."""
    if not plaintext:
        return ""
    token = _fernet().encrypt(plaintext.encode()).decode()
    return _ENC_PREFIX + token


def decrypt_secret(value: str) -> str:
    """Decrypt a stored secret. Non-prefixed values are returned as-is (legacy plaintext)."""
    if not value:
        return ""
    if not value.startswith(_ENC_PREFIX):
        return value  # legacy plaintext — transparent fallback
    token = value[len(_ENC_PREFIX):]
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        logger.warning("Failed to decrypt stored secret (wrong SECRET_KEY?); treating as empty")
        return ""

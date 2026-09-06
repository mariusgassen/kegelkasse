"""Per-club Telegram bot helpers.

Configuration lives in ``ClubSettings.extra["telegram"]`` (no dedicated table —
same pattern as the per-club SMTP settings in ``core/email.py``)::

    {
        "enabled": bool,
        "bot_token": str,        # encrypted at rest (core/crypto.py)
        "bot_username": str,     # fetched automatically via getMe on save
        "webhook_secret": str,   # random path secret, lazily generated
    }

Each club runs its own bot (created via Telegram's ``@BotFather``) so members
never need to hunt for a numeric Chat ID: they tap "connect" in their profile,
the app opens a ``t.me/<bot>?start=<code>`` deep link, and Telegram itself
delivers the resulting Chat ID to our webhook (see api/v1/telegram.py).
"""
import logging

import httpx

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"

# Fields the API round-trips as-is (bot_token is write-only, handled separately
# so it is never echoed back to the client — same convention as the SMTP password).
TELEGRAM_CONFIG_FIELDS = ("enabled", "bot_username")


def get_club_telegram_config(club) -> dict | None:
    """Return the club's Telegram config if enabled and minimally complete, else None."""
    if club is None or getattr(club, "settings", None) is None:
        return None
    cfg = (club.settings.extra or {}).get("telegram") or {}
    if not cfg.get("enabled") or not cfg.get("bot_token"):
        return None
    return cfg


def get_bot_info(bot_token: str) -> dict:
    """Call Telegram's ``getMe``; raises if the token is invalid or unreachable."""
    resp = httpx.get(f"{TELEGRAM_API}/bot{bot_token}/getMe", timeout=10)
    data = resp.json()
    if not data.get("ok"):
        raise ValueError(data.get("description") or "Telegram lehnte den Bot-Token ab.")
    return data["result"]


def set_webhook(bot_token: str, url: str) -> None:
    """Register the webhook URL Telegram should POST updates to. Raises on failure."""
    resp = httpx.post(f"{TELEGRAM_API}/bot{bot_token}/setWebhook", json={"url": url}, timeout=10)
    data = resp.json()
    if not data.get("ok"):
        raise ValueError(data.get("description") or "Webhook konnte nicht registriert werden.")


def delete_webhook(bot_token: str) -> None:
    """Remove the webhook (best-effort caller absorbs errors, see api/v1/club.py)."""
    resp = httpx.post(f"{TELEGRAM_API}/bot{bot_token}/deleteWebhook", timeout=10)
    data = resp.json()
    if not data.get("ok"):
        raise ValueError(data.get("description") or "Webhook konnte nicht entfernt werden.")


def send_telegram_message(bot_token: str, chat_id: str, text: str) -> None:
    """Send a single message via the club's bot. Raises on failure."""
    resp = httpx.post(
        f"{TELEGRAM_API}/bot{bot_token}/sendMessage",
        json={"chat_id": chat_id, "text": text},
        timeout=10,
    )
    data = resp.json()
    if not data.get("ok"):
        raise ValueError(data.get("description") or "Telegram-Nachricht konnte nicht gesendet werden.")


def send_telegram_notification(cfg: dict, chat_id: str, title: str, body: str, url: str = "/") -> bool:
    """Send a notification message; absorb and log any failure. Returns True on success."""
    if not chat_id:
        return False
    try:
        from core.crypto import decrypt_secret
        from core.config import settings

        text = f"{title}\n{body}"
        if url and (url.startswith("http://") or url.startswith("https://")):
            text += f"\n{url}"
        elif url and url != "/" and settings.APP_BASE_URL:
            text += f"\n{settings.APP_BASE_URL.rstrip('/')}/{url.lstrip('/')}"
        send_telegram_message(decrypt_secret(cfg["bot_token"]), chat_id, text)
        return True
    except Exception as exc:  # noqa: BLE001 — never let Telegram break a notification
        logger.warning("Telegram send failed to chat %s: %s", chat_id, exc, exc_info=True)
        return False

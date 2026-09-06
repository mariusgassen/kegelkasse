"""
Public Telegram bot webhook (see core/telegram.py for the wider design note).

Each club runs its own bot, so the webhook URL is scoped per club and guarded
by a random path secret (``webhook_secret``, lazily generated in
``ClubSettings.extra["telegram"]`` — same pattern as the scoreboard/iCal
tokens). This is untrusted external input: Telegram will retry forever on
anything but a 2xx response, so every branch is wrapped to never raise.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from core.database import get_db
from models.club import Club
from models.user import TelegramLinkCode, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telegram", tags=["telegram"])


def _resolve_club(club_id: int, secret: str, db: Session) -> Club:
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club or not club.settings:
        raise HTTPException(404, "Unknown club")
    cfg = (club.settings.extra or {}).get("telegram") or {}
    if not secret or cfg.get("webhook_secret") != secret:
        raise HTTPException(404, "Invalid webhook secret")
    return club


@router.post("/webhook/{club_id}/{secret}")
async def telegram_webhook(club_id: int, secret: str, request: Request, db: Session = Depends(get_db)):
    """Receive a Telegram Update, resolve a `/start <code>` link code to a user."""
    club = _resolve_club(club_id, secret, db)
    try:
        update = await request.json()
    except Exception as exc:  # noqa: BLE001 — malformed body must never 500
        logger.warning("Telegram webhook: malformed body for club %s: %s", club_id, exc)
        return {"ok": True}

    try:
        message = update.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        text = (message.get("text") or "").strip()
        if not chat_id or not text.startswith("/start "):
            return {"ok": True}
        code = text[len("/start "):].strip()

        link = (db.query(TelegramLinkCode)
                .filter(TelegramLinkCode.code == code, TelegramLinkCode.used_at.is_(None))
                .first())
        now = datetime.now(timezone.utc)
        expires_at = link.expires_at if link else None
        if expires_at and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if not link or (expires_at and expires_at < now):
            _reply(club, str(chat_id),
                  "⚠️ Dieser Link ist abgelaufen oder ungültig. Bitte fordere in der App einen neuen Verbindungslink an.")
            return {"ok": True}

        user = db.query(User).filter(User.id == link.user_id).first()
        if not user or user.club_id != club_id:
            return {"ok": True}

        user.telegram_chat_id = str(chat_id)
        link.used_at = now
        db.commit()
        _reply(club, str(chat_id),
              f"✅ Verbunden! Du erhältst jetzt Benachrichtigungen von {club.name} über Telegram.")
    except Exception as exc:  # noqa: BLE001 — never let untrusted input 500 this endpoint
        logger.warning("Telegram webhook processing failed for club %s: %s", club_id, exc, exc_info=True)
    return {"ok": True}


def _reply(club: Club, chat_id: str, text: str) -> None:
    """Best-effort confirmation message back to the chat that just linked/failed to link."""
    try:
        from core.crypto import decrypt_secret
        from core.telegram import send_telegram_message
        cfg = (club.settings.extra or {}).get("telegram") or {}
        bot_token = cfg.get("bot_token")
        if bot_token:
            send_telegram_message(decrypt_secret(bot_token), chat_id, text)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Telegram webhook reply failed: %s", exc)

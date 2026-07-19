"""Per-club email (SMTP) helpers.

Email server configuration is stored per club in ``ClubSettings.extra["email"]``
(no dedicated table — same pattern as reminder settings).  A club that has not
configured (or disabled) email simply won't send emails; delivery silently
falls back to logging only, exactly like an unconfigured VAPID push.

Config shape (all optional except host / from_address when enabled)::

    {
        "enabled": bool,
        "host": str,
        "port": int,          # default 587
        "username": str,
        "password": str,
        "from_address": str,
        "from_name": str,     # default "Kegelkasse"
        "use_tls": bool,      # STARTTLS (default True)
        "use_ssl": bool,      # implicit TLS (SMTP_SSL); overrides use_tls
    }
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

from core.config import settings

logger = logging.getLogger(__name__)

# Fields the API round-trips (password handled separately so it is never leaked).
EMAIL_CONFIG_FIELDS = ("enabled", "host", "port", "username", "from_address",
                       "from_name", "use_tls", "use_ssl")


def get_club_email_config(club) -> dict | None:
    """Return the club's email config if it is enabled and minimally complete, else None."""
    if club is None or getattr(club, "settings", None) is None:
        return None
    cfg = (club.settings.extra or {}).get("email") or {}
    if not cfg.get("enabled"):
        return None
    if not cfg.get("host") or not cfg.get("from_address"):
        return None
    return cfg


def build_email_bodies(title: str, body: str, url: str = "/") -> tuple[str, str]:
    """Build (text, html) bodies for a notification email, with an optional action link."""
    link: str | None = None
    if url:
        if url.startswith("http://") or url.startswith("https://"):
            link = url
        elif settings.APP_BASE_URL:
            link = settings.APP_BASE_URL.rstrip("/") + "/" + url.lstrip("/")

    text = f"{title}\n\n{body}"
    if link:
        text += f"\n\n{link}"

    button = (
        f'<p style="margin:24px 0 8px"><a href="{escape(link)}" '
        'style="background:#e8a020;color:#1a1410;text-decoration:none;padding:10px 18px;'
        'border-radius:8px;font-weight:700;display:inline-block">Öffnen</a></p>'
        if link else ""
    )
    html = (
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
        'max-width:520px;margin:0 auto;padding:24px;color:#2a2019">'
        f'<h2 style="margin:0 0 12px;font-size:18px">{escape(title)}</h2>'
        f'<p style="margin:0;font-size:15px;line-height:1.5;white-space:pre-line">{escape(body)}</p>'
        f'{button}'
        '<hr style="border:none;border-top:1px solid #e5ddd5;margin:24px 0 12px">'
        '<p style="margin:0;font-size:12px;color:#8a7a6e">Kegelkasse 🎳</p>'
        '</div>'
    )
    return text, html


def send_club_email(cfg: dict, to_address: str, subject: str,
                    text_body: str, html_body: str | None = None) -> None:
    """Send a single email via the club's SMTP server. Raises on failure."""
    from core.crypto import decrypt_secret
    host = cfg["host"]
    port = int(cfg.get("port") or 587)
    username = cfg.get("username") or ""
    password = decrypt_secret(cfg.get("password") or "")
    use_ssl = bool(cfg.get("use_ssl"))
    use_tls = bool(cfg.get("use_tls", True))
    from_addr = cfg["from_address"]
    from_name = cfg.get("from_name") or "Kegelkasse"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, from_addr))
    msg["To"] = to_address
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    context = ssl.create_default_context()
    if use_ssl:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=15) as server:
            if username:
                server.login(username, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            if use_tls:
                server.starttls(context=context)
            if username:
                server.login(username, password)
            server.send_message(msg)


def send_notification_email(cfg: dict, to_address: str, title: str, body: str, url: str = "/") -> bool:
    """Send a notification email; absorb and log any failure. Returns True on success."""
    if not to_address:
        return False
    try:
        text, html = build_email_bodies(title, body, url)
        send_club_email(cfg, to_address, title, text, html)
        return True
    except Exception as exc:  # noqa: BLE001 — never let email break a notification
        logger.warning("Email send failed to %s: %s", to_address, exc, exc_info=True)
        return False

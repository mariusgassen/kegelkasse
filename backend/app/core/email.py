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
        "base_url": str,      # overrides server-wide APP_BASE_URL for this club's email links
    }
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

from core.config import settings
from core.i18n import t

logger = logging.getLogger(__name__)

# Fields the API round-trips (password handled separately so it is never leaked).
EMAIL_CONFIG_FIELDS = ("enabled", "host", "port", "username", "from_address",
                       "from_name", "use_tls", "use_ssl", "base_url")

DEFAULT_PRIMARY = "#e8a020"


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


def _luminance(hex_color: str) -> float:
    """Relative luminance (0..1) of a #rrggbb color; used to pick contrasting text."""
    try:
        h = hex_color.lstrip("#")
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    except (ValueError, IndexError):
        return 0.5


def email_theme(club) -> dict:
    """Resolve the club's brand colors / name / logo for use in HTML emails.

    Emails keep a light, readable body; the club's primary color is used for the
    header band, section accents and buttons so the mail conforms to the club
    branding without risking dark-background rendering issues across mail clients.
    ``base_url`` resolves the club's own custom domain (``email.base_url``, e.g. a
    CNAME'd domain) over the server-wide ``APP_BASE_URL`` default, so absolute
    links in a club's emails point at the domain its members actually know.
    """
    primary = DEFAULT_PRIMARY
    name = "Kegelkasse"
    logo_abs: str | None = None
    base_url = settings.APP_BASE_URL
    if club is not None:
        name = club.name or name
        s = getattr(club, "settings", None)
        if s is not None:
            primary = s.primary_color or primary
            club_base_url = ((s.extra or {}).get("email") or {}).get("base_url")
            if club_base_url:
                base_url = club_base_url
            if s.logo_url and base_url:
                logo_abs = base_url.rstrip("/") + "/" + s.logo_url.lstrip("/")
    on_primary = "#1a1410" if _luminance(primary) > 0.55 else "#ffffff"
    return {"primary": primary, "on_primary": on_primary, "club_name": name,
            "logo_url": logo_abs, "base_url": base_url}


def _abs_link(url: str, base_url: str | None = None) -> str | None:
    """Turn an app-relative deep link into an absolute URL.

    Prefers ``base_url`` (a club's own custom domain, from ``email_theme``) over
    the server-wide ``APP_BASE_URL`` default; returns ``None`` — rendered as
    plain, non-clickable text — when neither is configured.
    """
    if not url:
        return None
    if url.startswith("http://") or url.startswith("https://"):
        return url
    base = base_url or settings.APP_BASE_URL
    if base:
        return base.rstrip("/") + "/" + url.lstrip("/")
    return None


def build_email_bodies(title: str, body: str, url: str = "/", theme: dict | None = None,
                       locale: str | None = None, button_key: str = "email.button.open") -> tuple[str, str]:
    """Build (text, html) bodies for a notification email, with an optional action link.

    ``button_key`` selects the i18n label for the action button (defaults to the
    generic "Open"); pass a task-specific key such as ``auth.reset.email.button``
    to give the button clearer intent.
    """
    th = theme or email_theme(None)
    link = _abs_link(url, th.get("base_url"))

    text = f"{title}\n\n{body}"
    if link:
        text += f"\n\n{link}"

    button = (
        f'<p style="margin:24px 0 8px"><a href="{escape(link)}" '
        f'style="background:{escape(th["primary"])};color:{escape(th["on_primary"])};'
        'text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;'
        f'display:inline-block">{escape(t(locale, button_key))}</a></p>'
        if link else ""
    )
    html = (
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
        'max-width:520px;margin:0 auto;padding:24px;color:#2a2019">'
        f'{_header_html(th)}'
        f'<h2 style="margin:0 0 12px;font-size:18px">{escape(title)}</h2>'
        f'<p style="margin:0;font-size:15px;line-height:1.5;white-space:pre-line">{escape(body)}</p>'
        f'{button}'
        '<hr style="border:none;border-top:1px solid #e5ddd5;margin:24px 0 12px">'
        f'<p style="margin:0;font-size:12px;color:#8a7a6e">{escape(t(locale, "email.footer"))}</p>'
        '</div>'
    )
    return text, html


def _header_html(theme: dict) -> str:
    """Branded header band: club logo as a circular avatar next to the club name.

    Mimics the app's own avatar treatment so the club is instantly recognizable
    even though mail clients don't let transactional senders control the actual
    inbox sender avatar (that requires Gravatar/BIMI, both outside this app's
    control) — this is the closest equivalent achievable in the message body.
    """
    name = theme["club_name"]
    logo_url = theme.get("logo_url")
    if logo_url:
        avatar = (
            f'<img src="{escape(logo_url)}" alt="{escape(name)}" width="36" height="36" '
            'style="width:36px;height:36px;border-radius:50%;object-fit:cover;'
            'vertical-align:middle;border:2px solid #ffffff;background:#ffffff">'
        )
    else:
        initial = escape(name[:1].upper()) if name else "🎳"
        avatar = (
            '<span style="display:inline-block;width:36px;height:36px;border-radius:50%;'
            f'background:#ffffff;color:{escape(theme["primary"])};font-weight:800;'
            f'font-size:16px;line-height:36px;text-align:center;vertical-align:middle">'
            f'{initial}</span>'
        )
    return (
        f'<div style="background:{escape(theme["primary"])};padding:14px 20px;'
        'border-radius:12px;text-align:center;margin:0 0 20px">'
        f'{avatar}'
        '<span style="display:inline-block;vertical-align:middle;margin-left:10px;'
        f'font-size:17px;font-weight:800;color:{escape(theme["on_primary"])}">'
        f'{escape(name)} 🎳</span>'
        '</div>'
    )


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


def send_notification_email(cfg: dict, to_address: str, title: str, body: str, url: str = "/",
                            theme: dict | None = None, locale: str | None = None) -> bool:
    """Send a notification email; absorb and log any failure. Returns True on success."""
    if not to_address:
        return False
    try:
        text, html = build_email_bodies(title, body, url, theme=theme, locale=locale)
        send_club_email(cfg, to_address, title, text, html)
        return True
    except Exception as exc:  # noqa: BLE001 — never let email break a notification
        logger.warning("Email send failed to %s: %s", to_address, exc, exc_info=True)
        return False


def send_password_reset_email(cfg: dict, to_address: str, reset_url: str,
                              theme: dict | None = None, locale: str | None = None) -> bool:
    """Send a self-service password-reset email; absorb and log any failure.

    Themed + localized like every other outbound mail; the action button links
    to the app's public ``?reset=<token>`` completion flow. Returns True on send.
    """
    if not to_address:
        return False
    try:
        subject = t(locale, "auth.reset.email.subject")
        body = t(locale, "auth.reset.email.body")
        text, html = build_email_bodies(subject, body, reset_url, theme=theme, locale=locale,
                                        button_key="auth.reset.email.button")
        send_club_email(cfg, to_address, subject, text, html)
        return True
    except Exception as exc:  # noqa: BLE001 — never let email break the request flow
        logger.warning("Password reset email failed to %s: %s", to_address, exc, exc_info=True)
        return False


# ---------------------------------------------------------------------------
# Digest email
# ---------------------------------------------------------------------------

def _digest_row(label: str, value: str, url: str | None, theme: dict, snippet: str | None = None) -> str:
    """One list row inside a digest section — label/value with an optional deep link.

    ``snippet`` renders an italic content preview (e.g. the latest comment's
    text) on its own line below the row, so the reader doesn't have to open
    the app just to see what was said.
    """
    link = _abs_link(url, theme.get("base_url")) if url else None
    title = (
        f'<a href="{escape(link)}" style="color:{escape(theme["primary"])};'
        f'text-decoration:none;font-weight:600">{escape(label)}</a>'
        if link else f'<span style="font-weight:600">{escape(label)}</span>'
    )
    row = (
        '<tr>'
        f'<td style="padding:6px 0;font-size:14px;color:#2a2019">{title}</td>'
        f'<td style="padding:6px 0;font-size:14px;color:#5a4a3e;text-align:right;'
        f'white-space:nowrap">{escape(value)}</td>'
        '</tr>'
    )
    if snippet:
        row += (
            '<tr><td colspan="2" style="padding:0 0 8px;font-size:13px;color:#8a7a6e;'
            f'font-style:italic">„{escape(snippet)}"</td></tr>'
        )
    return row


def _digest_section(heading: str, rows: list[str], theme: dict) -> str:
    if not rows:
        return ""
    return (
        f'<h3 style="margin:24px 0 4px;font-size:13px;text-transform:uppercase;'
        f'letter-spacing:.5px;color:{escape(theme["primary"])}">{escape(heading)}</h3>'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="border-collapse:collapse">'
        f'{"".join(rows)}</table>'
    )


def build_digest_email(theme: dict, data: dict, locale: str | None) -> tuple[str, str, str]:
    """Build (subject, text, html) for a personalized digest.

    ``data`` is the structure returned by :func:`core.digest.build_digest`.
    """
    from core.i18n import format_date, format_money

    subject = t(locale, "digest.subject")
    name = data.get("member_name") or ""
    since = data.get("since")
    app_link = _abs_link("/", theme.get("base_url"))

    # ---- Plain-text body ----
    lines = [t(locale, "digest.greeting", name=name)]
    if since:
        lines.append(t(locale, "digest.intro", since=format_date(since, locale)))
    else:
        lines.append(t(locale, "digest.intro_first"))
    if app_link:
        lines.append(app_link)
    lines.append("")

    html_parts: list[str] = []
    cta_html = (
        f'<p style="margin:2px 0 20px"><a href="{escape(app_link)}" '
        f'style="background:{escape(theme["primary"])};color:{escape(theme["on_primary"])};'
        'text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:700;'
        f'font-size:14px;display:inline-block">{escape(t(locale, "digest.button.open"))}</a></p>'
        if app_link else ""
    )

    bal = data.get("balance")
    if bal:
        html_rows = [
            _digest_row(t(locale, "digest.balance.balance"),
                        format_money(bal["balance"], locale), bal.get("url"), theme),
            _digest_row(t(locale, "digest.balance.penalties"),
                        format_money(bal["penalty_total"], locale), bal.get("url"), theme),
            _digest_row(t(locale, "digest.balance.paid"),
                        format_money(bal["paid_total"], locale), bal.get("url"), theme),
        ]
        html_parts.append(_digest_section(t(locale, "digest.section.balance"), html_rows, theme))
        lines.append(f"— {t(locale, 'digest.section.balance')} —")
        if bal["balance"] < -0.005:
            lines.append(t(locale, "digest.balance.owed", amount=format_money(-bal["balance"], locale)))
        elif bal["balance"] > 0.005:
            lines.append(t(locale, "digest.balance.credit", amount=format_money(bal["balance"], locale)))
        else:
            lines.append(t(locale, "digest.balance.settled"))
        lines.append("")

    for key, items in (("evenings", data.get("evenings") or []),
                       ("penalties", data.get("penalties") or []),
                       ("bookings", data.get("bookings") or []),
                       ("community", data.get("community") or [])):
        if not items:
            continue
        heading = t(locale, f"digest.section.{key}")
        rows = [_digest_row(it["label"], it.get("value", ""), it.get("url"), theme, it.get("snippet"))
               for it in items]
        html_parts.append(_digest_section(heading, rows, theme))
        lines.append(f"— {heading} —")
        for it in items:
            val = f" · {it['value']}" if it.get("value") else ""
            lines.append(f"• {it['label']}{val}")
            if it.get("snippet"):
                lines.append(f'  „{it["snippet"]}"')
        lines.append("")

    lines.append(t(locale, "digest.footer"))
    text = "\n".join(lines)

    html = (
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
        'max-width:560px;margin:0 auto;padding:24px;color:#2a2019">'
        f'{_header_html(theme)}'
        f'<p style="margin:0 0 4px;font-size:15px">{escape(t(locale, "digest.greeting", name=name))}</p>'
        f'<p style="margin:0 0 8px;font-size:15px;color:#5a4a3e">'
        f'{escape(t(locale, "digest.intro", since=format_date(since, locale)) if since else t(locale, "digest.intro_first"))}</p>'
        f'{cta_html}'
        f'{"".join(html_parts)}'
        '<hr style="border:none;border-top:1px solid #e5ddd5;margin:28px 0 12px">'
        f'<p style="margin:0;font-size:12px;color:#8a7a6e;line-height:1.5">'
        f'{escape(t(locale, "digest.footer"))}</p>'
        '</div>'
    )
    return subject, text, html

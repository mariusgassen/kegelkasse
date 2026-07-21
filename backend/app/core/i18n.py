"""Minimal server-side i18n for outbound emails (digest + notifications).

The frontend owns the full translation catalogue; the backend only needs the
handful of strings that appear in emails it renders itself.  Keeping this tiny
and self-contained avoids depending on the system ``locale`` (unreliable inside
slim Docker images) for month names and number formatting.

Supported locales: ``de`` (default) and ``en``.
"""
from __future__ import annotations

from datetime import date, datetime

DEFAULT_LOCALE = "de"
SUPPORTED_LOCALES = ("de", "en")

# Month names, indexed 1..12 (index 0 unused).
_MONTHS: dict[str, tuple[str, ...]] = {
    "de": ("", "Januar", "Februar", "März", "April", "Mai", "Juni", "Juli",
           "August", "September", "Oktober", "November", "Dezember"),
    "en": ("", "January", "February", "March", "April", "May", "June", "July",
           "August", "September", "October", "November", "December"),
}

_STRINGS: dict[str, dict[str, str]] = {
    "digest.subject": {
        "de": "Deine Kegelkasse-Zusammenfassung",
        "en": "Your Kegelkasse digest",
    },
    "digest.greeting": {
        "de": "Hallo {name},",
        "en": "Hi {name},",
    },
    "digest.intro": {
        "de": "hier ist deine Zusammenfassung seit {since}.",
        "en": "here is your summary since {since}.",
    },
    "digest.intro_first": {
        "de": "hier ist deine erste Zusammenfassung aus dem Verein.",
        "en": "here is your first summary from the club.",
    },
    "digest.section.balance": {"de": "Dein Konto", "en": "Your account"},
    "digest.section.evenings": {"de": "Kegelabende", "en": "Bowling evenings"},
    "digest.section.penalties": {"de": "Deine Strafen", "en": "Your penalties"},
    "digest.section.bookings": {"de": "Deine Buchungen", "en": "Your bookings"},
    "digest.section.community": {"de": "Neues aus dem Verein", "en": "Club news"},
    "digest.balance.balance": {"de": "Kontostand", "en": "Balance"},
    "digest.balance.penalties": {"de": "Strafen gesamt", "en": "Total penalties"},
    "digest.balance.paid": {"de": "Eingezahlt", "en": "Paid in"},
    "digest.balance.settled": {"de": "Alles ausgeglichen — danke!", "en": "All settled — thank you!"},
    "digest.balance.owed": {"de": "Offen: {amount}", "en": "Outstanding: {amount}"},
    "digest.balance.credit": {"de": "Guthaben: {amount}", "en": "Credit: {amount}"},
    "digest.evening.new": {"de": "Neuer Abend", "en": "New evening"},
    "digest.evening.closed": {"de": "Abgeschlossen", "en": "Closed"},
    "digest.evening.updated": {"de": "Aktualisiert", "en": "Updated"},
    "digest.community.untitled": {"de": "Neuigkeit", "en": "Update"},
    "digest.button.open": {"de": "Öffnen", "en": "Open"},
    "digest.footer": {
        "de": "Du erhältst diese E-Mail, weil du eine Zusammenfassung abonniert hast. "
              "Häufigkeit im Profil unter Benachrichtigungen ändern.",
        "en": "You receive this email because you subscribed to a digest. "
              "Change the frequency in your profile under notifications.",
    },
    "email.button.open": {"de": "Öffnen", "en": "Open"},
    "email.footer": {"de": "Kegelkasse 🎳", "en": "Kegelkasse 🎳"},
}


def normalize_locale(locale: str | None) -> str:
    """Return a supported locale code, falling back to the default."""
    if not locale:
        return DEFAULT_LOCALE
    code = locale.split("-")[0].lower()
    return code if code in SUPPORTED_LOCALES else DEFAULT_LOCALE


def t(locale: str | None, key: str, **kwargs) -> str:
    """Translate ``key`` into ``locale`` with optional ``str.format`` params."""
    loc = normalize_locale(locale)
    entry = _STRINGS.get(key)
    if entry is None:
        text = key
    else:
        text = entry.get(loc) or entry.get(DEFAULT_LOCALE) or key
    if kwargs:
        try:
            return text.format(**kwargs)
        except (KeyError, IndexError):
            return text
    return text


def format_date(value: date | datetime | None, locale: str | None) -> str:
    """Localized long date, e.g. '15. März 2026' / 'March 15, 2026'."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        value = value.date()
    loc = normalize_locale(locale)
    month = _MONTHS[loc][value.month]
    if loc == "en":
        return f"{month} {value.day}, {value.year}"
    return f"{value.day}. {month} {value.year}"


def format_money(amount: float, locale: str | None) -> str:
    """Format a euro amount, German-style comma decimals for 'de', dot for 'en'."""
    loc = normalize_locale(locale)
    s = f"{amount:.2f}"
    if loc == "de":
        s = s.replace(".", ",")
    return f"{s} €"

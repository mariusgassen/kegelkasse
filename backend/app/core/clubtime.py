"""Club wall-clock time ↔ real instants.

Evening times are entered as local wall-clock times (an admin types 20:00) and stored as-is in the
UTC slot of the timestamp column (20:00+00:00). Inside the app that round-trips consistently, but
anything that hands a time to other software — the iCal feed, the public schedule API — must turn it
into the real instant first, or calendars and websites show the evening 1–2 hours late.
"""
from datetime import datetime, UTC
from zoneinfo import ZoneInfo

from core.config import settings


def club_tz() -> ZoneInfo:
    return ZoneInfo(settings.CLUB_TIMEZONE)


def wall_to_utc(dt: datetime) -> datetime:
    """Stored wall-clock time → the real UTC instant it denotes in the club's time zone."""
    return dt.replace(tzinfo=club_tz()).astimezone(UTC)


def wall_now() -> datetime:
    """The current club wall-clock time in the stored representation — for comparing against stored times."""
    return datetime.now(club_tz()).replace(tzinfo=UTC)

"""Shared Pydantic base for request bodies."""
from typing import Any

from pydantic import BaseModel, model_validator

# Field names whose value is a secret. Whitespace can be a legitimate part of a password, and
# silently trimming one turns a correct credential into a wrong one — so these pass through raw.
_SECRET_HINTS = ("password", "secret")


class TrimmedModel(BaseModel):
    """
    Strips leading/trailing whitespace from every string field.

    A stray space is invisible in an input box but not in the data: it shows up in exports, reports
    and the config bundle ("Pin fehlt " vs "Pin fehlt"), it breaks name matching, and it makes two
    otherwise identical entries sort apart. Individual forms used to call `.trim()` by hand, which
    means the guarantee held only where somebody remembered — and not at all for the offline queue,
    which replays bodies captured before any of that ran.

    Doing it here instead makes it a property of the API: whatever the client sends, what gets
    stored is trimmed.
    """

    @model_validator(mode="before")
    @classmethod
    def _strip_strings(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        return {
            key: value.strip()
            if isinstance(value, str) and not any(h in str(key).lower() for h in _SECRET_HINTS)
            else value
            for key, value in data.items()
        }

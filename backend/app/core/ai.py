"""Thin wrapper around the Claude API (Anthropic SDK) for the optional AI features.

Everything here is off unless ``ANTHROPIC_API_KEY`` is set — ``ai_enabled()`` is what the
``/ai/status`` endpoint reports and what every AI endpoint checks first, so an install
without a key simply never shows the buttons.

Each feature makes exactly one request and gets back JSON that matches a schema
(structured outputs), so callers never parse free text. Callers pass only the data the
feature needs: Kegelnamen instead of full names, no e-mail addresses, no account data
beyond what the feature is about.
"""
import json
import logging
from typing import Any

from core.config import settings

logger = logging.getLogger(__name__)

# The "default" fallback form lets the API re-run a declined request on a fallback model
# chosen by refusal category, so a harmless joke recap doesn't fail on a false positive.
_FALLBACK_BETA = "server-side-fallback-2026-07-01"

_client = None


class AIUnavailable(Exception):
    """Raised when the AI feature can't produce an answer (no key, API error, refusal)."""


def ai_enabled() -> bool:
    return bool(settings.ANTHROPIC_API_KEY.strip())


def _get_client():
    global _client
    if _client is None:
        import anthropic  # imported lazily: installs without a key never touch the SDK

        _client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=90.0, max_retries=2)
    return _client


def _create_message(**kwargs):
    """Single seam for tests: everything that talks to the network goes through here."""
    return _get_client().beta.messages.create(**kwargs)


def generate_json(system: str, data: dict, schema: dict, *, task: str,
                  effort: str = "medium", max_tokens: int = 8000,
                  model: str | None = None) -> dict[str, Any]:
    """Ask Claude for a JSON object matching ``schema``.

    ``task`` is the instruction for this one request, ``data`` the facts it works from
    (serialised as JSON so names and numbers can't be confused with instructions).
    ``model`` is the club's choice from its AI settings; ``ANTHROPIC_MODEL`` otherwise.
    """
    if not ai_enabled():
        raise AIUnavailable("AI is not configured")

    import anthropic

    user_content = (
        f"{task}\n\n<daten>\n{json.dumps(data, ensure_ascii=False, default=str)}\n</daten>"
    )
    try:
        response = _create_message(
            model=model or settings.ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_content}],
            output_config={
                "effort": effort,
                "format": {"type": "json_schema", "schema": schema},
            },
            betas=[_FALLBACK_BETA],
            fallbacks="default",
        )
    except anthropic.RateLimitError as e:
        logger.warning("Claude API rate limited: %s", e)
        raise AIUnavailable("rate_limited") from e
    except anthropic.APIStatusError as e:
        logger.error("Claude API error %s: %s", e.status_code, e.message)
        raise AIUnavailable("api_error") from e
    except anthropic.APIConnectionError as e:
        logger.error("Claude API unreachable: %s", e)
        raise AIUnavailable("unreachable") from e

    if response.stop_reason == "refusal":
        raise AIUnavailable("refused")
    if response.stop_reason == "max_tokens":
        raise AIUnavailable("truncated")
    text = next((b.text for b in response.content if getattr(b, "type", None) == "text"), None)
    if not text:
        raise AIUnavailable("empty")
    try:
        result = json.loads(text)
    except json.JSONDecodeError as e:
        raise AIUnavailable("invalid_json") from e
    if not isinstance(result, dict):
        raise AIUnavailable("invalid_json")
    return result

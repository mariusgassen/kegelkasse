"""In-memory sliding-window rate limiting for public endpoints.

Same approach as the password-reset limiter in ``api/v1/auth.py``: Coolify runs a single app
container, so per-process state is enough to cap abuse (mail floods) without shared storage.
"""
import time
from fastapi import Request


class SlidingWindowLimiter:
    def __init__(self, window_seconds: int):
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}

    def hit(self, key: str, max_hits: int) -> bool:
        """Record a hit for ``key``; return True if it exceeds ``max_hits`` per window."""
        now = time.monotonic()
        hits = [ts for ts in self._hits.get(key, []) if ts > now - self.window]
        if len(hits) >= max_hits:
            self._hits[key] = hits
            return True
        hits.append(now)
        self._hits[key] = hits
        return False

    def reset(self) -> None:
        self._hits.clear()


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

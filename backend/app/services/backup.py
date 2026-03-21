"""
pgbackrest backup utilities.

The app talks to a lightweight HTTP management server (mgmt_server.py)
running inside the db container on port 8089 (internal Docker network).
That server runs pgbackrest as the postgres user and returns JSON.
"""
import logging

import httpx

logger = logging.getLogger(__name__)


def _mgmt_url() -> str:
    from core.config import settings
    return settings.PGB_MGMT_URL.rstrip("/")


async def get_backup_info() -> list[dict]:
    """Return pgbackrest stanza info (list of stanza objects)."""
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{_mgmt_url()}/info")
        r.raise_for_status()
        return r.json()


async def run_backup(backup_type: str = "full") -> dict:
    """Trigger a pgbackrest backup and return updated stanza info."""
    logger.info(f"Triggering pgbackrest {backup_type} backup")
    async with httpx.AsyncClient(timeout=600) as client:
        r = await client.post(f"{_mgmt_url()}/backup", params={"type": backup_type})
    if r.status_code != 200:
        err = r.json().get("error", r.text)
        raise RuntimeError(f"pgbackrest backup failed: {err}")
    result = r.json()
    logger.info("pgbackrest backup completed")
    return result

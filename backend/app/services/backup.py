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


async def get_backup_config() -> dict:
    """Return pgbackrest repo configuration (type, S3 info) from the mgmt server."""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(f"{_mgmt_url()}/config")
        r.raise_for_status()
        return r.json()


async def delete_backup(label: str) -> None:
    """Expire (delete) a specific backup set by label."""
    logger.info(f"Deleting backup set {label}")
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.delete(f"{_mgmt_url()}/backup/{label}")
    if r.status_code == 404:
        raise FileNotFoundError(f"Backup {label} not found")
    if r.status_code != 200:
        err = r.json().get("error", r.text)
        raise RuntimeError(f"pgbackrest expire failed: {err}")
    logger.info(f"Backup set {label} deleted")


async def stream_backup(label: str):
    """Return a StreamingResponse that proxies the backup tar.gz from the mgmt server."""
    from fastapi.responses import StreamingResponse

    # Verify the label exists before streaming
    info = await get_backup_info()
    all_labels = [b["label"] for s in info for b in s.get("backup", [])]
    if label not in all_labels:
        raise FileNotFoundError(f"Backup {label} not found")

    url = f"{_mgmt_url()}/backup/{label}/download"

    async def generate():
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("GET", url) as r:
                r.raise_for_status()
                async for chunk in r.aiter_bytes(65536):
                    yield chunk

    return StreamingResponse(
        generate(),
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="backup-{label}.tar.gz"'},
    )

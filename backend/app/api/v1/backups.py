"""Backup management endpoints — superadmin only."""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException

from api.deps import require_superadmin
from core.config import settings
from models.user import User
from services.backup import (
    delete_backup,
    get_backup_config,
    get_backup_info,
    run_backup,
    stream_backup,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backups", tags=["backups"])

_LABEL_RE = re.compile(r"^[\w-]+$")


def _validate_label(label: str) -> None:
    if not _LABEL_RE.match(label):
        raise HTTPException(400, "Invalid backup label")


@router.get("")
async def get_backups(user: User = Depends(require_superadmin)):
    """Return pgbackrest stanza info and current backup configuration."""
    try:
        info = await get_backup_info()
    except Exception as e:
        raise HTTPException(502, f"pgbackrest unavailable: {e}")
    repo_config: dict = {}
    try:
        repo_config = await get_backup_config()
    except Exception:
        pass
    return {
        "info": info,
        "config": {
            "schedule": settings.BACKUP_SCHEDULE,
            "retain_full": settings.BACKUP_RETAIN_FULL,
            "mgmt_url": settings.PGB_MGMT_URL,
            **repo_config,
        },
    }


@router.post("")
async def create_backup(user: User = Depends(require_superadmin)):
    """Trigger a manual full pgbackrest backup."""
    logger.info("Manual backup triggered by superadmin=%d", user.id)
    try:
        result = await run_backup("full")
        logger.info("Manual backup completed: superadmin=%d", user.id)
        return result
    except Exception as e:
        logger.error("Manual backup failed: superadmin=%d error=%s", user.id, e)
        raise HTTPException(500, str(e))


@router.get("/{label}/download")
async def download_backup_file(label: str, user: User = Depends(require_superadmin)):
    """Stream a backup as a tar.gz download (local repo only)."""
    _validate_label(label)
    try:
        return await stream_backup(label)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(502, f"Download failed: {e}")


@router.delete("/{label}")
async def remove_backup(label: str, user: User = Depends(require_superadmin)):
    """Expire (delete) a specific backup set."""
    _validate_label(label)
    try:
        await delete_backup(label)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))
    logger.warning("Backup deleted: label=%s by superadmin=%d", label, user.id)
    return {"ok": True}

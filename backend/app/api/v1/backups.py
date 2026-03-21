"""Backup management endpoints — superadmin only."""
from fastapi import APIRouter, Depends, HTTPException

from api.deps import require_superadmin
from core.config import settings
from models.user import User
from services.backup import get_backup_info, run_backup

router = APIRouter(prefix="/backups", tags=["backups"])


@router.get("")
async def get_backups(user: User = Depends(require_superadmin)):
    """Return pgbackrest stanza info and current backup configuration."""
    try:
        info = await get_backup_info()
    except Exception as e:
        raise HTTPException(502, f"pgbackrest unavailable: {e}")
    return {
        "info": info,
        "config": {
            "schedule": settings.BACKUP_SCHEDULE,
            "retain_full": settings.BACKUP_RETAIN_FULL,
            "mgmt_url": settings.PGB_MGMT_URL,
        },
    }


@router.post("")
async def create_backup(user: User = Depends(require_superadmin)):
    """Trigger a manual full pgbackrest backup."""
    try:
        return await run_backup("full")
    except Exception as e:
        raise HTTPException(500, str(e))

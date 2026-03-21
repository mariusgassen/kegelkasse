"""Backup management endpoints — superadmin only."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from api.deps import require_superadmin
from core.config import settings
from models.user import User
from services.backup import delete_backup, get_backup_path, list_backups, run_backup

router = APIRouter(prefix="/backups", tags=["backups"])


@router.get("")
def get_backups(user: User = Depends(require_superadmin)):
    """List all available backups and current backup configuration."""
    return {
        "backups": list_backups(),
        "config": {
            "schedule": settings.BACKUP_SCHEDULE,
            "retain_days": settings.BACKUP_RETAIN_DAYS,
            "s3_enabled": bool(settings.S3_BUCKET),
            "s3_bucket": settings.S3_BUCKET or None,
            "s3_prefix": settings.S3_PREFIX,
            "backup_dir": settings.BACKUP_DIR,
        },
    }


@router.post("")
async def create_backup(user: User = Depends(require_superadmin)):
    """Trigger a manual backup immediately."""
    try:
        return await run_backup()
    except Exception as e:
        raise HTTPException(500, f"Backup failed: {e}")


@router.get("/{filename}/download")
def download_backup(filename: str, user: User = Depends(require_superadmin)):
    """Download a backup file."""
    path = get_backup_path(filename)
    if not path:
        raise HTTPException(404, "Backup not found")
    return FileResponse(path=str(path), filename=filename, media_type="application/gzip")


@router.delete("/{filename}")
def remove_backup(filename: str, user: User = Depends(require_superadmin)):
    """Delete a backup file from disk."""
    if not delete_backup(filename):
        raise HTTPException(404, "Backup not found")
    return {"ok": True}

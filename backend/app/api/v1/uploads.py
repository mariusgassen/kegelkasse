"""Generic media upload endpoint for highlights, announcements, and comments."""
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from api.deps import require_club_member
from models.user import User

router = APIRouter(prefix="/uploads", tags=["uploads"])

_UPLOAD_DIR = Path("/app/uploads/media")
_ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
_MAX_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/media")
async def upload_media(
    file: UploadFile = File(...),
    user: User = Depends(require_club_member),
):
    """Upload an image or GIF (JPEG/PNG/WebP/GIF, max 10 MB). Returns the public URL."""
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(400, "Unsupported file type. Use JPEG, PNG, WebP, or GIF.")
    data = await file.read()
    if len(data) > _MAX_SIZE:
        raise HTTPException(413, "File too large. Maximum size is 10 MB.")
    ext = _ALLOWED_TYPES[file.content_type]
    filename = f"media_{user.club_id}_{uuid.uuid4().hex}.{ext}"
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (_UPLOAD_DIR / filename).write_bytes(data)
    return {"url": f"/uploads/media/{filename}"}

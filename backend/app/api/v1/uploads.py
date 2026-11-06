"""Generic media upload endpoint for highlights, announcements, and comments, plus the route that
serves every stored file (``/uploads/<key>``) from the active storage backend."""
import mimetypes
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from api.deps import require_club_member
from core.storage import get_storage, is_valid_key, url_for_key
from models.user import User

router = APIRouter(prefix="/uploads", tags=["uploads"])
# Mounted without the /api/v1 prefix: the URLs stored in the database are /uploads/<key>.
serve_router = APIRouter(tags=["uploads"])

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
    key = f"media/media_{user.club_id}_{uuid.uuid4().hex}.{ext}"
    get_storage().put(key, data, file.content_type)
    return {"url": url_for_key(key)}


@serve_router.api_route("/uploads/{key:path}", methods=["GET", "HEAD"], include_in_schema=False)
def serve_upload(key: str):
    """Stream a stored file. Public, like the old static mount: the uuid/hash file names are the
    access control, and images must load in <img> tags and e-mails without a token."""
    if not is_valid_key(key):
        raise HTTPException(404)
    obj = get_storage().open(key)
    if obj is None:
        raise HTTPException(404)
    content_type = mimetypes.guess_type(key)[0] or obj.content_type or "application/octet-stream"
    headers = {
        # Keys never get new content (new upload = new key), so they can be cached forever.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
    }
    if obj.size is not None:
        headers["Content-Length"] = str(obj.size)
    if obj.etag:
        headers["ETag"] = obj.etag
    return StreamingResponse(obj.body, media_type=content_type, headers=headers)

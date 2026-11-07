"""Generic media upload endpoint for highlights, announcements, and comments, plus the route that
serves every stored file (``/uploads/<key>``) from the active storage backend."""
import mimetypes
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from api.deps import require_club_member
from core import images
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
    data = images.shrink(data, file.content_type)
    ext = _ALLOWED_TYPES[file.content_type]
    key = f"media/media_{user.club_id}_{uuid.uuid4().hex}.{ext}"
    get_storage().put(key, data, file.content_type)
    return {"url": url_for_key(key)}


@serve_router.api_route("/uploads/{key:path}", methods=["GET", "HEAD"], include_in_schema=False)
def serve_upload(key: str, w: int | None = Query(None, ge=16, le=4000)):
    """Stream a stored file. Public, like the old static mount: the uuid/hash file names are the
    access control, and images must load in <img> tags and e-mails without a token."""
    if not is_valid_key(key):
        raise HTTPException(404)
    storage = get_storage()
    if w is not None and key.startswith("media/"):
        # Smaller copy for lists/maps; built once and cached next to the original.
        width = images.nearest_width(w)
        vkey = f"thumbs/{width}/{key.split('/', 1)[1]}"
        vobj = storage.open(vkey)
        if vobj is None:
            ctype = mimetypes.guess_type(key)[0] or ""
            src = storage.open(key)
            original = b"".join(src.body) if src else None
            variant = images.make_variant(original, ctype, width) if original else None
            if variant is not None:
                storage.put(vkey, variant, ctype)
                vobj = storage.open(vkey)
        if vobj is not None:
            return _respond(vkey, vobj)
    obj = storage.open(key)
    if obj is None:
        raise HTTPException(404)
    return _respond(key, obj)


def _respond(key: str, obj):
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

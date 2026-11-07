"""Server-side image handling for uploads: shrink big originals once, serve small variants on demand.

Phones deliver 4-12 MB photos at 4000+ px; a feed full of them is what made pictures crawl in.
Uploads are therefore capped to ``MAX_SIDE`` (EXIF rotation baked in), and ``/uploads/<key>?w=N``
serves a cached, smaller copy (``thumbs/N/<name>``) for lists, maps and previews.
Every function degrades to "keep the original" for data Pillow cannot read."""
from __future__ import annotations

import io
import logging
from typing import Optional

logger = logging.getLogger(__name__)

MAX_SIDE = 2048
VARIANT_WIDTHS = (240, 480, 960, 1600)
# Below this size a photo is left alone — re-encoding a small file only loses quality.
_SKIP_BELOW_BYTES = 400 * 1024
_RESIZABLE = {"image/jpeg", "image/png", "image/webp"}


def nearest_width(w: int) -> int:
    """Snap a requested width to an allowed one (so the cache cannot be filled with arbitrary sizes)."""
    for allowed in VARIANT_WIDTHS:
        if w <= allowed:
            return allowed
    return VARIANT_WIDTHS[-1]


def _encode(img, content_type: str) -> bytes:
    out = io.BytesIO()
    if content_type == "image/png":
        img.save(out, "PNG", optimize=True)
    elif content_type == "image/webp":
        img.save(out, "WEBP", quality=85, method=4)
    else:
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(out, "JPEG", quality=85, optimize=True, progressive=True)
    return out.getvalue()


def shrink(data: bytes, content_type: str, max_side: int = MAX_SIDE) -> bytes:
    """Return ``data`` re-encoded at most ``max_side`` px on the long edge, or unchanged when it is
    already small, animated or unreadable."""
    if content_type not in _RESIZABLE:
        return data
    try:
        from PIL import Image, ImageOps

        img = Image.open(io.BytesIO(data))
        if getattr(img, "is_animated", False):
            return data
        rotated = img.getexif().get(0x0112, 1) not in (0, 1)
        oriented = ImageOps.exif_transpose(img)
        if max(oriented.size) <= max_side and len(data) <= _SKIP_BELOW_BYTES and not rotated:
            return data
        oriented.thumbnail((max_side, max_side), Image.LANCZOS)
        out = _encode(oriented, content_type)
        return out if len(out) < len(data) or rotated else data
    except Exception:  # noqa: BLE001 — a broken image must still upload exactly as before
        logger.info("Could not shrink image, keeping original", exc_info=True)
        return data


def make_variant(data: bytes, content_type: str, width: int) -> Optional[bytes]:
    """A copy no wider/taller than ``width`` px, or ``None`` when no variant makes sense."""
    if content_type not in _RESIZABLE:
        return None
    try:
        from PIL import Image, ImageOps

        img = Image.open(io.BytesIO(data))
        if getattr(img, "is_animated", False) or max(img.size) <= width:
            return None
        img = ImageOps.exif_transpose(img)
        img.thumbnail((width, width), Image.LANCZOS)
        return _encode(img, content_type)
    except Exception:  # noqa: BLE001
        logger.info("Could not build image variant", exc_info=True)
        return None

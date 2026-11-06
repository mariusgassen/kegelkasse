"""
Club-branded PWA app icons (#102).

An admin can turn the club logo into the app icon every member installs. The icons are rendered
server-side as PNGs — Firefox and Chrome on Android ignore SVG manifest icons, and iOS only reads a
PNG ``apple-touch-icon`` — from the uploaded logo plus one background derived from the club palette.

Everything here is pure (bytes in, bytes out) except :func:`load_logo_bytes`, which is the only
place that knows where a logo lives: uploaded logos are read through :mod:`core.storage` (uploads
volume or Garage/S3), absolute ``http(s)`` logo URLs over HTTP.
"""
from __future__ import annotations

import colorsys
import hashlib
import io
import logging
from collections import OrderedDict
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from core import storage

logger = logging.getLogger(__name__)

# Bump when the rendering itself changes, so cached icons (and installed apps) pick up the new look.
RENDER_VERSION = 1

DEFAULT_DARK_BG = "#1a1410"
DEFAULT_PRIMARY = "#e8a020"
DEFAULT_SECONDARY = "#6b7c5a"

VARIANTS = ("dark", "light", "primary", "secondary")
DEFAULT_VARIANT = "dark"

# kind → (pixel size, shape). "any" = rounded square with transparent corners; "maskable" = full
# bleed, the content kept inside the 80 % safe-zone circle Android crops to; "apple" = full bleed,
# opaque (iOS rounds the corners itself and renders transparency as black).
KINDS: dict[str, tuple[int, str]] = {
    "icon-192": (192, "any"),
    "icon-512": (512, "any"),
    "maskable-512": (512, "maskable"),
    "apple-touch-icon": (180, "apple"),
}

# Share of the canvas the logo may occupy. Maskable must fit a square inside the safe-zone circle
# (0.8 / √2 ≈ 0.566).
_CONTENT_SCALE = {"any": 0.78, "apple": 0.74, "maskable": 0.54}
_ANY_CORNER_RADIUS = 0.22

_MAX_LOGO_BYTES = 5 * 1024 * 1024

_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
)


# ── Colors ──

def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)


def _rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def _valid_hex(value: Optional[str], fallback: str) -> str:
    if not value:
        return fallback
    try:
        _hex_to_rgb(value)
        return value
    except (ValueError, IndexError):
        return fallback


def _luminance(rgb: tuple[int, int, int]) -> float:
    def ch(c: int) -> float:
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a: str, b: str) -> float:
    la, lb = _luminance(_hex_to_rgb(a)), _luminance(_hex_to_rgb(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def mirror_light(bg: str) -> str:
    """Light-mode twin of a dark background — same rule as the app's ``resolveThemedBg`` (#55):
    mirror the lightness, keep hue and saturation, never darker than 85 %."""
    r, g, b = (c / 255 for c in _hex_to_rgb(bg))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l2 = max(1 - l, 0.85)
    r2, g2, b2 = colorsys.hls_to_rgb(h, l2, s)
    return _rgb_to_hex((round(r2 * 255), round(g2 * 255), round(b2 * 255)))


def variant_background(variant: str, primary: Optional[str], secondary: Optional[str],
                       bg: Optional[str]) -> str:
    dark = _valid_hex(bg, DEFAULT_DARK_BG)
    if variant == "light":
        return mirror_light(dark)
    if variant == "primary":
        return _valid_hex(primary, DEFAULT_PRIMARY)
    if variant == "secondary":
        return _valid_hex(secondary, DEFAULT_SECONDARY)
    return dark


def monogram_color(background: str, primary: Optional[str]) -> str:
    """Brand color when it reads on the background, else black or white — whichever contrasts more."""
    brand = _valid_hex(primary, DEFAULT_PRIMARY)
    if contrast(brand, background) >= 3:
        return brand
    return "#000000" if contrast("#000000", background) >= contrast("#ffffff", background) else "#ffffff"


# ── Logo source ──

def load_logo_bytes(logo_url: Optional[str]) -> Optional[bytes]:
    """Fetch the raw logo bytes, wherever the logo is stored. ``None`` when there is none or it
    cannot be read — the renderer then falls back to the club's monogram."""
    if not logo_url:
        return None
    try:
        if logo_url.startswith(("http://", "https://")):
            import httpx
            resp = httpx.get(logo_url, timeout=5, follow_redirects=True)
            resp.raise_for_status()
            return resp.content if len(resp.content) <= _MAX_LOGO_BYTES else None
        key = storage.key_from_url(logo_url)  # refuses anything outside the uploads area
        if key:
            obj = storage.get_storage().open(key)  # S3 falls back to the volume for unmigrated files
            if obj is None:
                return None
            data = b"".join(obj.body)
            return data if len(data) <= _MAX_LOGO_BYTES else None
    except Exception as exc:  # a broken logo must never break the manifest
        logger.warning("app icon: could not load logo %s: %s", logo_url, exc)
    return None


def decode_logo(data: Optional[bytes]) -> Optional[Image.Image]:
    """Raster logos only — Pillow cannot rasterise SVG, so an SVG logo yields ``None``."""
    if not data:
        return None
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
        return img.convert("RGBA")
    except Exception:
        return None


def logo_is_renderable(logo_url: Optional[str]) -> bool:
    return decode_logo(load_logo_bytes(logo_url)) is not None


# ── Rendering ──

def _font(size: int) -> ImageFont.ImageFont:
    for path in _FONT_CANDIDATES:
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def initials(name: Optional[str]) -> str:
    words = [w for w in (name or "").split() if w[:1].isalnum()]
    if not words:
        return "K"
    if len(words) == 1:
        return words[0][0].upper()
    return (words[0][0] + words[1][0]).upper()


def render_icon(size: int, shape: str, background: str, logo: Optional[Image.Image],
                monogram: str, monogram_fg: str) -> bytes:
    """Render one icon as PNG bytes."""
    scale = 4 if shape == "any" else 1  # supersample the rounded mask for smooth corners
    canvas = Image.new("RGBA", (size, size), _hex_to_rgb(background) + (255,))
    box = round(size * _CONTENT_SCALE[shape])

    if logo is not None:
        art = logo.copy()
        art.thumbnail((box, box), Image.LANCZOS)
        canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    else:
        draw = ImageDraw.Draw(canvas)
        font = _font(round(box * (0.62 if len(monogram) > 1 else 0.8)))
        draw.text((size / 2, size / 2), monogram, font=font, fill=_hex_to_rgb(monogram_fg), anchor="mm")

    if shape == "any":
        mask = Image.new("L", (size * scale, size * scale), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, size * scale - 1, size * scale - 1), radius=round(size * scale * _ANY_CORNER_RADIUS), fill=255)
        canvas.putalpha(mask.resize((size, size), Image.LANCZOS))
    else:
        canvas = canvas.convert("RGB")  # opaque: maskable and apple-touch icons must not be transparent

    out = io.BytesIO()
    canvas.save(out, format="PNG", optimize=True)
    return out.getvalue()


# ── Club-level resolution ──

def icon_config(settings) -> dict:
    """The stored ``app_icon`` block, normalised."""
    raw = ((settings.extra or {}) if settings else {}).get("app_icon") or {}
    variant = raw.get("variant") if raw.get("variant") in VARIANTS else DEFAULT_VARIANT
    return {"enabled": bool(raw.get("enabled")), "variant": variant, "token": raw.get("token")}


def _background_for(settings, variant: str) -> str:
    extra = (settings.extra or {}) if settings else {}
    return variant_background(variant, getattr(settings, "primary_color", None),
                              getattr(settings, "secondary_color", None), extra.get("bg_color"))


def icon_version(settings, club_name: str, variant: Optional[str] = None) -> str:
    """Short content hash of everything that changes the rendered pixels — the cache-busting ``v``."""
    v = variant or icon_config(settings)["variant"]
    bg = _background_for(settings, v)
    parts = [str(RENDER_VERSION), v, bg, getattr(settings, "logo_url", None) or "",
             getattr(settings, "primary_color", None) or "", initials(club_name)]
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:12]


_CACHE: "OrderedDict[tuple, bytes]" = OrderedDict()
_CACHE_MAX = 128


def render_club_icon(settings, club_name: str, kind: str, variant: Optional[str] = None) -> bytes:
    """Rendered PNG for one club icon. Memoised on the content version, so a logo or palette change
    produces a fresh render and repeat requests cost nothing."""
    size, shape = KINDS[kind]
    v = variant or icon_config(settings)["variant"]
    key = (icon_version(settings, club_name, v), kind)
    cached = _CACHE.get(key)
    if cached is not None:
        _CACHE.move_to_end(key)
        return cached

    primary = getattr(settings, "primary_color", None)
    background = _background_for(settings, v)
    logo = decode_logo(load_logo_bytes(getattr(settings, "logo_url", None)))
    png = render_icon(size, shape, background, logo, initials(club_name), monogram_color(background, primary))

    _CACHE[key] = png
    if len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)
    return png


def clear_cache() -> None:
    _CACHE.clear()

"""
Club-branded PWA app icons (#102).

Admin:
  GET   /club/app-icon   — current setting + a rendered preview per palette variant
  PATCH /club/app-icon   — {enabled?, variant?}

Public (browsers fetch these without a login while installing the app):
  GET /app-icon/{token}/manifest.webmanifest
  GET /app-icon/{token}/{kind}.png?v=…

The token is an unguessable secret (same pattern as the iCal / TV-scoreboard links) so the club's
name and logo can't be probed by slug. A valid token on a club that switched the feature off still
gets a manifest — with the stock icons — so installed apps fall back to the default on their next
manifest refresh instead of keeping a stale club icon.
"""
import base64
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from api.deps import require_club_admin
from core import app_icon as icons
from core.database import get_db
from core.schemas import TrimmedModel
from models.club import Club, ClubSettings
from models.user import User

router = APIRouter(tags=["app-icon"])

_MANIFEST_BASE = {
    "id": "/",
    "name": "Kegelkasse",
    "short_name": "Kegelkasse",
    "description": "9-Pin Bowling Club Manager",
    "theme_color": "#3d3540",
    "display": "standalone",
    "orientation": "any",
    "start_url": "/",
    "scope": "/",
    "capture_links": "existing-client-navigate",
}

_DEFAULT_ICONS = [
    {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
    {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
    {"src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    {"src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
]


def icon_url(token: str, kind: str, version: str) -> str:
    return f"/api/v1/app-icon/{token}/{kind}.png?v={version}"


def serialize_app_icon(settings: Optional[ClubSettings], club_name: str) -> dict:
    """The member-facing block in ``GET /club/`` — URLs only while the feature is on, so the
    frontend has exactly one condition to check."""
    cfg = icons.icon_config(settings)
    out = {"enabled": cfg["enabled"], "variant": cfg["variant"],
           "manifest_url": None, "apple_touch_icon_url": None, "icon_url": None}
    if cfg["enabled"] and cfg["token"]:
        v = icons.icon_version(settings, club_name)
        out["manifest_url"] = f"/api/v1/app-icon/{cfg['token']}/manifest.webmanifest?v={v}"
        out["apple_touch_icon_url"] = icon_url(cfg["token"], "apple-touch-icon", v)
        out["icon_url"] = icon_url(cfg["token"], "icon-192", v)
    return out


def _resolve(token: str, db: Session) -> tuple[Club, ClubSettings]:
    if not token:
        raise HTTPException(404, "Not found")
    for s in db.query(ClubSettings).filter(ClubSettings.extra.isnot(None)).all():
        if (s.extra or {}).get("app_icon", {}).get("token") == token:
            club = db.query(Club).filter(Club.id == s.club_id).first()
            if club:
                return club, s
    raise HTTPException(404, "Not found")


# ── Public ──

@router.get("/app-icon/{token}/manifest.webmanifest")
def get_manifest(token: str, db: Session = Depends(get_db)):
    club, s = _resolve(token, db)
    cfg = icons.icon_config(s)
    manifest = dict(_MANIFEST_BASE)
    if cfg["enabled"]:
        v = icons.icon_version(s, club.name)
        manifest["background_color"] = icons._background_for(s, cfg["variant"])
        manifest["icons"] = [
            {"src": icon_url(token, "icon-192", v), "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": icon_url(token, "icon-512", v), "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": icon_url(token, "maskable-512", v), "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ]
    else:
        manifest["background_color"] = icons.DEFAULT_DARK_BG
        manifest["icons"] = _DEFAULT_ICONS
    return Response(
        content=json.dumps(manifest),
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/app-icon/{token}/{kind}.png")
def get_icon(token: str, kind: str, v: Optional[str] = None, db: Session = Depends(get_db)):
    if kind not in icons.KINDS:
        raise HTTPException(404, "Not found")
    club, s = _resolve(token, db)
    cfg = icons.icon_config(s)
    if not cfg["enabled"]:
        raise HTTPException(404, "Not found")
    current = icons.icon_version(s, club.name)
    png = icons.render_club_icon(s, club.name, kind)
    # A request for the current version can be cached forever — the URL changes with the content.
    cache = "public, max-age=31536000, immutable" if v == current else "public, max-age=300"
    return Response(content=png, media_type="image/png", headers={"Cache-Control": cache})


# ── Admin ──

def _settings_for(user: User, db: Session) -> tuple[Club, Optional[ClubSettings]]:
    club = db.query(Club).filter(Club.id == user.club_id).first()
    if not club:
        raise HTTPException(404)
    return club, db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()


def _admin_view(club: Club, s: Optional[ClubSettings]) -> dict:
    cfg = icons.icon_config(s)
    previews = []
    for variant in icons.VARIANTS:
        png = icons.render_club_icon(s, club.name, "apple-touch-icon", variant)
        previews.append({
            "variant": variant,
            "background": icons._background_for(s, variant),
            "preview": "data:image/png;base64," + base64.b64encode(png).decode(),
        })
    logo_url = getattr(s, "logo_url", None)
    return {
        "enabled": cfg["enabled"],
        "variant": cfg["variant"],
        "has_logo": bool(logo_url),
        # False for an SVG (or unreadable) logo: the icon then shows the club's initials instead.
        "logo_renderable": icons.logo_is_renderable(logo_url) if logo_url else False,
        "variants": previews,
    }


@router.get("/club/app-icon")
def get_app_icon_settings(db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    club, s = _settings_for(user, db)
    return _admin_view(club, s)


class AppIconUpdate(TrimmedModel):
    enabled: Optional[bool] = None
    variant: Optional[str] = None


@router.patch("/club/app-icon")
def update_app_icon_settings(data: AppIconUpdate, db: Session = Depends(get_db),
                             user: User = Depends(require_club_admin)):
    if data.variant is not None and data.variant not in icons.VARIANTS:
        raise HTTPException(400, "Unknown variant")
    club, s = _settings_for(user, db)
    if not s:
        s = ClubSettings(club_id=user.club_id)
        db.add(s)
    extra = dict(s.extra or {})
    block = dict(extra.get("app_icon") or {})
    if data.enabled is not None:
        block["enabled"] = data.enabled
    if data.variant is not None:
        block["variant"] = data.variant
    if not block.get("token"):
        block["token"] = uuid.uuid4().hex
    extra["app_icon"] = block
    s.extra = extra
    db.commit()
    db.refresh(s)
    return _admin_view(club, s)

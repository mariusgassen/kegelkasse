"""Sticker wall — photos of club stickers put up on trips and holidays, with their location."""
import logging
from datetime import UTC, date as date_type, datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import Field
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from core.push import push_to_club
from core.schemas import TrimmedModel
from core.storage import key_from_url
from models.evening import RegularMember
from models.sticker import Sticker
from models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stickers", tags=["stickers"])

PLACE_MAX = 120
CAPTION_MAX = 1000


def _author_names(user_ids: set[int], db: Session) -> dict[int, str]:
    """Kegelname (nickname) of the linked member, else the account name."""
    if not user_ids:
        return {}
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    rm_ids = {u.regular_member_id for u in users if u.regular_member_id}
    members = {m.id: m for m in db.query(RegularMember).filter(RegularMember.id.in_(rm_ids)).all()} if rm_ids else {}
    out: dict[int, str] = {}
    for u in users:
        rm = members.get(u.regular_member_id) if u.regular_member_id else None
        out[u.id] = (rm.nickname or rm.name) if rm else u.name
    return out


def _can_edit(s: Sticker, user: User) -> bool:
    return s.created_by == user.id or user.role in (UserRole.admin, UserRole.superadmin)


def _serialize(s: Sticker, names: dict[int, str], user: User) -> dict:
    return {
        "id": s.id,
        "media_url": s.media_url,
        "place_name": s.place_name,
        "latitude": s.latitude,
        "longitude": s.longitude,
        "caption": s.caption,
        "stuck_on": s.stuck_on.isoformat() if s.stuck_on else None,
        "created_by_name": names.get(s.created_by) if s.created_by else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "can_edit": _can_edit(s, user),
    }


def _check_media(url: str, club_id: int) -> str:
    """Only photos uploaded through ``POST /uploads/media`` by this club are accepted."""
    key = key_from_url(url)
    if not key or not key.startswith(f"media/media_{club_id}_"):
        raise HTTPException(400, "Invalid photo")
    return url


def _parse_day(value: Optional[str]) -> Optional[date_type]:
    if not value:
        return None
    try:
        d = date_type.fromisoformat(value[:10])
    except ValueError:
        raise HTTPException(400, "Invalid date")
    if d > datetime.now(UTC).date():
        raise HTTPException(400, "Date is in the future")
    return d


def _clean_place(value: str) -> str:
    if not value:
        raise HTTPException(400, "Place is required")
    return value


def _get_own_club_sticker(sid: int, user: User, db: Session) -> Sticker:
    s = db.query(Sticker).filter(
        Sticker.id == sid, Sticker.club_id == user.club_id, Sticker.is_deleted == False,  # noqa: E712
    ).first()
    if not s:
        raise HTTPException(404, "Sticker not found")
    return s


class StickerCreate(TrimmedModel):
    media_url: str
    place_name: str = Field(max_length=PLACE_MAX)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    caption: Optional[str] = Field(default=None, max_length=CAPTION_MAX)
    stuck_on: Optional[str] = None


class StickerUpdate(TrimmedModel):
    media_url: Optional[str] = None
    place_name: Optional[str] = Field(default=None, max_length=PLACE_MAX)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    caption: Optional[str] = Field(default=None, max_length=CAPTION_MAX)
    stuck_on: Optional[str] = None  # "" clears the date


@router.get("/")
def list_stickers(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """All stickers of the caller's club, newest first (by the day stuck, then by posting time)."""
    items = db.query(Sticker).filter(
        Sticker.club_id == user.club_id, Sticker.is_deleted == False,  # noqa: E712
    ).all()
    items.sort(key=lambda s: (s.stuck_on or (s.created_at.date() if s.created_at else date_type.min),
                              s.created_at or datetime.min.replace(tzinfo=UTC), s.id), reverse=True)
    names = _author_names({s.created_by for s in items if s.created_by}, db)
    return [_serialize(s, names, user) for s in items]


@router.post("/")
def create_sticker(data: StickerCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    s = Sticker(
        club_id=user.club_id,
        created_by=user.id,
        media_url=_check_media(data.media_url, user.club_id),
        place_name=_clean_place(data.place_name),
        latitude=data.latitude,
        longitude=data.longitude,
        caption=data.caption or None,
        stuck_on=_parse_day(data.stuck_on),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    logger.info("Sticker created: id=%d club=%d user=%d place=%r", s.id, user.club_id, user.id, s.place_name)
    author = _author_names({user.id}, db)
    # Opt-in category (off by default); the poster does not need to hear about their own post.
    background_tasks.add_task(
        push_to_club, db, user.club_id, "🏷️ Neuer Sticker",
        f"{author.get(user.id, user.name)} hat einen Sticker in {s.place_name} gepostet",
        f"/#stickers?item={s.id}", category="stickers", exclude_user_id=user.id,
    )
    return _serialize(s, author, user)


@router.patch("/{sid}")
def update_sticker(sid: int, data: StickerUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    s = _get_own_club_sticker(sid, user, db)
    if not _can_edit(s, user):
        raise HTTPException(403, "Only the author or an admin can edit this sticker")
    fields = data.model_dump(exclude_unset=True)
    # Validate everything before touching the ORM object, so a rejected request leaves no dirty state.
    updates: dict = {}
    if "media_url" in fields and fields["media_url"] is not None:
        updates["media_url"] = _check_media(fields["media_url"], user.club_id)
    if "place_name" in fields and fields["place_name"] is not None:
        updates["place_name"] = _clean_place(fields["place_name"])
    if ("latitude" in fields) != ("longitude" in fields):
        raise HTTPException(400, "Latitude and longitude must be changed together")
    if fields.get("latitude") is not None and fields.get("longitude") is not None:
        updates["latitude"] = fields["latitude"]
        updates["longitude"] = fields["longitude"]
    if "caption" in fields:
        updates["caption"] = fields["caption"] or None
    if "stuck_on" in fields:
        updates["stuck_on"] = _parse_day(fields["stuck_on"])
    for k, v in updates.items():
        setattr(s, k, v)
    s.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(s)
    return _serialize(s, _author_names({s.created_by} if s.created_by else set(), db), user)


@router.delete("/{sid}", status_code=204)
def delete_sticker(sid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    s = _get_own_club_sticker(sid, user, db)
    if not _can_edit(s, user):
        raise HTTPException(403, "Only the author or an admin can delete this sticker")
    s.is_deleted = True
    db.commit()

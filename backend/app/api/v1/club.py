"""
Club management — settings, regular members, penalty types, game templates.
All write operations require club_admin role.
Read operations available to all club members.
"""
import logging
import uuid
from datetime import date as date_type, datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_club_admin
from core.database import get_db
from core.push import push_to_regular_member, push_to_club_admins
from models.club import Club, ClubSettings, ClubPin
from models.evening import RegularMember, ClubTeam, EveningPlayer, Evening
from models.game import GameTemplate, WinnerType
from models.payment import MemberPayment, ClubExpense, PaymentRequest, PaymentRequestStatus
from models.penalty import PenaltyType, PenaltyLog
from models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/club", tags=["club"])


def _serialize_settings(s: ClubSettings) -> dict:
    extra = s.extra or {}
    return {
        "home_venue": s.home_venue,
        "logo_url": s.logo_url,
        "primary_color": s.primary_color or "#e8a020",
        "secondary_color": s.secondary_color or "#6b7c5a",
        "bg_color": extra.get("bg_color"),
        "guest_penalty_cap": extra.get("guest_penalty_cap"),
        "paypal_me": extra.get("paypal_me"),
        "no_cancel_fee": extra.get("no_cancel_fee"),
        "pin_penalty": extra.get("pin_penalty"),
        "default_evening_time": extra.get("default_evening_time"),
        "ical_token": extra.get("ical_token"),
    }


# ── Club info & settings ──

def _ensure_ical_token(s: ClubSettings, db: Session) -> None:
    """Lazily generate ical_token for clubs created before migration 023."""
    import uuid
    extra = dict(s.extra or {})
    if not extra.get("ical_token"):
        extra["ical_token"] = str(uuid.uuid4())
        s.extra = extra
        db.commit()


@router.get("/")
def get_club(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    club = db.query(Club).filter(Club.id == user.club_id).first()
    if not club: raise HTTPException(404)
    s = club.settings
    if s:
        _ensure_ical_token(s, db)
    return {
        "id": club.id, "name": club.name, "slug": club.slug,
        "settings": _serialize_settings(s) if s else {}
    }


class ClubSettingsUpdate(BaseModel):
    home_venue: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    bg_color: Optional[str] = None
    guest_penalty_cap: Optional[float] = None
    paypal_me: Optional[str] = None
    no_cancel_fee: Optional[float] = None  # extra penalty for members who did not cancel
    pin_penalty: Optional[float] = None   # penalty for not bringing pins to an evening
    default_evening_time: Optional[str] = None  # default start time for scheduled evenings (HH:MM)
    name: Optional[str] = None  # club name rename


_SETTINGS_COLUMNS = {"home_venue", "primary_color", "secondary_color"}
_SETTINGS_EXTRA = {"bg_color", "guest_penalty_cap", "paypal_me", "no_cancel_fee", "pin_penalty", "default_evening_time"}


@router.patch("/settings")
def update_club_settings(data: ClubSettingsUpdate, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    """Admin only: update club settings (home venue, colors) and club name."""
    payload = data.model_dump(exclude_none=True)
    if "name" in payload:
        club = db.query(Club).filter(Club.id == user.club_id).first()
        if club:
            club.name = payload["name"]
    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    if not s:
        s = ClubSettings(club_id=user.club_id)
        db.add(s)
    for field, value in payload.items():
        if field in _SETTINGS_COLUMNS:
            setattr(s, field, value)
        elif field in _SETTINGS_EXTRA:
            extra = dict(s.extra or {})
            extra[field] = value
            s.extra = extra
    db.commit()
    return {"ok": True}


@router.post("/settings/regenerate-ical-token")
def regenerate_ical_token(db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    """Admin only: rotate the iCal feed token (invalidates old links)."""
    import uuid
    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    if not s:
        s = ClubSettings(club_id=user.club_id)
        db.add(s)
    extra = dict(s.extra or {})
    extra["ical_token"] = str(uuid.uuid4())
    s.extra = extra
    db.commit()
    return {"ical_token": extra["ical_token"]}


_UPLOAD_DIR = Path("/app/uploads/logos")
_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}
_MAX_LOGO_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/logo")
async def upload_club_logo(
        file: UploadFile = File(...),
        db: Session = Depends(get_db),
        user: User = Depends(require_club_admin),
):
    """Admin only: upload a club logo image (JPEG/PNG/WebP/GIF/SVG, max 5 MB)."""
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, "Unsupported file type. Use JPEG, PNG, WebP, GIF or SVG.")

    # Read and size-check
    data = await file.read()
    if len(data) > _MAX_LOGO_SIZE:
        raise HTTPException(413, "Logo too large. Maximum size is 5 MB.")

    # Determine extension from content-type for safety (ignore original filename)
    _ext_map = {
        "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
        "image/gif": "gif", "image/svg+xml": "svg",
    }
    ext = _ext_map[file.content_type]
    filename = f"club_{user.club_id}_{uuid.uuid4().hex}.{ext}"

    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = _UPLOAD_DIR / filename
    dest.write_bytes(data)

    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    if not s:
        s = ClubSettings(club_id=user.club_id)
        db.add(s)

    # Delete old logo file if it was a locally uploaded one
    if s.logo_url and s.logo_url.startswith("/uploads/logos/"):
        old_path = Path("/app") / s.logo_url.lstrip("/")
        if old_path.exists():
            old_path.unlink(missing_ok=True)

    s.logo_url = f"/uploads/logos/{filename}"
    db.commit()
    logger.info("Logo uploaded: club=%d filename=%s", user.club_id, filename)
    return {"logo_url": s.logo_url}


@router.delete("/logo")
def delete_club_logo(db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    """Admin only: remove the club logo."""
    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    if not s:
        raise HTTPException(404)
    if s.logo_url and s.logo_url.startswith("/uploads/logos/"):
        old_path = Path("/app") / s.logo_url.lstrip("/")
        if old_path.exists():
            old_path.unlink(missing_ok=True)
    s.logo_url = None
    db.commit()
    logger.info("Logo deleted: club=%d user=%d", user.club_id, user.id)
    return {"ok": True}


@router.get("/members")
def get_members(include_inactive: bool = False, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    q = db.query(User).filter(User.club_id == user.club_id)
    if not include_inactive:
        q = q.filter(User.is_active == True)
    users = q.order_by(User.name).all()
    return [{"id": u.id, "name": u.name, "role": u.role,
             "regular_member_id": u.regular_member_id, "is_active": u.is_active,
             "avatar": u.avatar, "username": u.username} for u in users]


@router.patch("/members/{member_id}/role")
def update_member_role(member_id: int, role: str, db: Session = Depends(get_db),
                       user: User = Depends(require_club_admin)):
    """Admin only: promote or demote club members."""
    target = db.query(User).filter(User.id == member_id, User.club_id == user.club_id).first()
    if not target: raise HTTPException(404)
    try:
        target.role = UserRole(role)
    except ValueError:
        raise HTTPException(400, "Invalid role")
    db.commit()
    logger.info("Member role updated: user=%d new_role=%s by admin=%d", member_id, role, user.id)
    return {"ok": True}


@router.delete("/members/{member_id}")
def deactivate_member(member_id: int, db: Session = Depends(get_db),
                      user: User = Depends(require_club_admin)):
    """Admin only: soft-delete a club member (preserves stats)."""
    target = db.query(User).filter(User.id == member_id, User.club_id == user.club_id).first()
    if not target: raise HTTPException(404)
    if target.role == UserRole.superadmin:
        raise HTTPException(403, "Cannot deactivate superadmin")
    if target.id == user.id:
        raise HTTPException(400, "Verwende 'Konto löschen' im eigenen Profil")
    target.is_active = False
    db.commit()
    logger.info("Member deactivated: user=%d by admin=%d", member_id, user.id)
    return {"ok": True}


@router.patch("/members/{member_id}/reactivate")
def reactivate_member(member_id: int, db: Session = Depends(get_db),
                      user: User = Depends(require_club_admin)):
    """Admin only: reactivate a previously deactivated member."""
    target = db.query(User).filter(User.id == member_id, User.club_id == user.club_id).first()
    if not target: raise HTTPException(404)
    target.is_active = True
    db.commit()
    return {"ok": True}


class LinkRosterRequest(BaseModel):
    regular_member_id: Optional[int] = None


@router.patch("/members/{member_id}/link")
def link_user_to_roster(member_id: int, data: LinkRosterRequest, db: Session = Depends(get_db),
                        user: User = Depends(require_club_admin)):
    """Admin only: link or unlink a user account to a roster (RegularMember) entry."""
    target = db.query(User).filter(User.id == member_id, User.club_id == user.club_id).first()
    if not target: raise HTTPException(404)
    if data.regular_member_id is not None:
        member = db.query(RegularMember).filter(
            RegularMember.id == data.regular_member_id,
            RegularMember.club_id == user.club_id
        ).first()
        if not member: raise HTTPException(404, "Roster-Eintrag nicht gefunden")
    target.regular_member_id = data.regular_member_id
    db.commit()
    return {"ok": True}


# ── Regular members (Stammspieler) — admin write, all read ──

def _member_dict(m: RegularMember, avatar: str | None = None) -> dict:
    return {"id": m.id, "name": m.name, "nickname": m.nickname,
            "is_guest": m.is_guest, "is_active": m.is_active,
            "is_committee": m.is_committee, "avatar": avatar}


@router.get("/regular-members")
def list_regular_members(include_inactive: bool = False, db: Session = Depends(get_db),
                         user: User = Depends(require_club_member)):
    q = (db.query(RegularMember, User.avatar)
         .outerjoin(User, User.id == RegularMember.user_id)
         .filter(RegularMember.club_id == user.club_id))
    if not include_inactive:
        q = q.filter(RegularMember.is_active == True)
    rows = q.order_by(RegularMember.name).all()
    return [_member_dict(m, avatar) for m, avatar in rows]


class RegularMemberCreate(BaseModel):
    name: str
    nickname: Optional[str] = None
    is_guest: bool = False


@router.post("/regular-members")
def create_regular_member(data: RegularMemberCreate, db: Session = Depends(get_db),
                          user: User = Depends(require_club_member)):
    m = RegularMember(club_id=user.club_id, name=data.name,
                      nickname=data.nickname, is_guest=data.is_guest)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _member_dict(m)


@router.put("/regular-members/{mid}")
def update_regular_member(mid: int, data: RegularMemberCreate, db: Session = Depends(get_db),
                          user: User = Depends(require_club_admin)):
    m = db.query(RegularMember).filter(RegularMember.id == mid, RegularMember.club_id == user.club_id).first()
    if not m: raise HTTPException(404)
    m.name = data.name
    m.nickname = data.nickname
    m.is_guest = data.is_guest
    db.commit()
    return _member_dict(m)


@router.delete("/regular-members/{mid}")
def delete_regular_member(mid: int, db: Session = Depends(get_db),
                          user: User = Depends(require_club_admin)):
    m = db.query(RegularMember).filter(RegularMember.id == mid, RegularMember.club_id == user.club_id).first()
    if not m: raise HTTPException(404)
    if m.is_guest:
        # Guests stay part of the club history (evening participation, stats) — never deletable
        raise HTTPException(400, "Gäste können nicht entfernt werden — sie bleiben Teil der Vereinshistorie")
    # Regular member leaving — convert to guest so they can still play, block login, clear pins
    m.is_guest = True
    for pin in db.query(ClubPin).filter(ClubPin.holder_regular_member_id == mid).all():
        pin.holder_regular_member_id = None
        pin.holder_name = None
        pin.assigned_at = None
    linked_user = db.query(User).filter(User.regular_member_id == mid, User.club_id == user.club_id).first()
    if linked_user:
        linked_user.is_active = False
    db.commit()
    logger.info("Regular member removed from club: member=%d by admin=%d", mid, user.id)
    return {"ok": True}


@router.patch("/regular-members/{mid}/reactivate")
def reactivate_regular_member(mid: int, db: Session = Depends(get_db),
                               user: User = Depends(require_club_admin)):
    """Admin only: promote a guest back to regular member and restore their linked user account."""
    m = db.query(RegularMember).filter(RegularMember.id == mid, RegularMember.club_id == user.club_id).first()
    if not m: raise HTTPException(404)
    m.is_guest = False
    m.is_active = True
    linked_user = db.query(User).filter(User.regular_member_id == mid, User.club_id == user.club_id).first()
    if linked_user:
        linked_user.is_active = True
    db.commit()
    return {"ok": True}


@router.post("/regular-members/{discard_id}/merge-into/{keep_id}")
def merge_regular_members(discard_id: int, keep_id: int, db: Session = Depends(get_db),
                          user: User = Depends(require_club_admin)):
    """Re-attribute all data from discard to keep, then soft-delete discard."""
    from models.evening import EveningPlayer
    from models.user import InviteToken
    discard = db.query(RegularMember).filter(
        RegularMember.id == discard_id, RegularMember.club_id == user.club_id).first()
    keep = db.query(RegularMember).filter(
        RegularMember.id == keep_id, RegularMember.club_id == user.club_id).first()
    if not discard or not keep:
        raise HTTPException(404)
    if discard_id == keep_id:
        raise HTTPException(400, "Gleicher Eintrag")
    # Re-attribute evening players
    db.query(EveningPlayer).filter(EveningPlayer.regular_member_id == discard_id).update(
        {EveningPlayer.regular_member_id: keep_id})
    # Re-attribute linked user accounts
    db.query(User).filter(User.regular_member_id == discard_id).update(
        {User.regular_member_id: keep_id})
    # Re-attribute invite tokens
    db.query(InviteToken).filter(InviteToken.regular_member_id == discard_id).update(
        {InviteToken.regular_member_id: keep_id})
    # Soft-delete the discarded entry
    discard.is_active = False
    db.commit()
    return {"ok": True, "kept_id": keep_id}


@router.post("/regular-members/{mid}/invite")
def create_member_invite(mid: int, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    """Create a one-time invite link pre-linked to a specific Stammspieler."""
    from datetime import timedelta
    import secrets as _secrets
    from models.user import InviteToken
    m = db.query(RegularMember).filter(RegularMember.id == mid, RegularMember.club_id == user.club_id).first()
    if not m: raise HTTPException(404)
    token_val = _secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    invite = InviteToken(
        token=token_val, club_id=user.club_id,
        created_by=user.id, expires_at=expires,
        regular_member_id=mid,
    )
    db.add(invite)
    db.commit()
    return {"token": token_val, "invite_url": f"/join?token={token_val}", "member_name": m.name}


# ── Penalty types — admin write, all read ──

@router.get("/penalty-types")
def list_penalty_types(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    return db.query(PenaltyType).filter(
        PenaltyType.club_id == user.club_id, PenaltyType.is_active == True
    ).order_by(PenaltyType.sort_order).all()


class PenaltyTypeCreate(BaseModel):
    icon: str = "⚠️"
    name: str
    default_amount: float = 0.5
    sort_order: int = 0


@router.post("/penalty-types")
def create_penalty_type(data: PenaltyTypeCreate, db: Session = Depends(get_db),
                        user: User = Depends(require_club_admin)):
    pt = PenaltyType(club_id=user.club_id, **data.model_dump())
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@router.put("/penalty-types/{ptid}")
def update_penalty_type(ptid: int, data: PenaltyTypeCreate, db: Session = Depends(get_db),
                        user: User = Depends(require_club_admin)):
    pt = db.query(PenaltyType).filter(PenaltyType.id == ptid, PenaltyType.club_id == user.club_id).first()
    if not pt: raise HTTPException(404)
    for k, v in data.model_dump().items(): setattr(pt, k, v)
    db.commit()
    return pt


@router.delete("/penalty-types/{ptid}")
def delete_penalty_type(ptid: int, db: Session = Depends(get_db),
                        user: User = Depends(require_club_admin)):
    pt = db.query(PenaltyType).filter(PenaltyType.id == ptid, PenaltyType.club_id == user.club_id).first()
    if not pt: raise HTTPException(404)
    pt.is_active = False
    db.commit()
    return {"ok": True}


# ── Game templates — admin write, all read ──

@router.get("/game-templates")
def list_game_templates(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    return db.query(GameTemplate).filter(
        GameTemplate.club_id == user.club_id, GameTemplate.is_active == True
    ).order_by(GameTemplate.sort_order).all()


class GameTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    winner_type: str = "individual"
    turn_mode: Optional[str] = None
    is_opener: bool = False
    is_president_game: bool = False
    default_loser_penalty: float = 0
    per_point_penalty: float = 0
    sort_order: int = 0


def _template_dict(gt: GameTemplate) -> dict:
    return {
        "id": gt.id, "name": gt.name, "is_opener": gt.is_opener,
        "is_president_game": gt.is_president_game,
        "winner_type": gt.winner_type,
        "turn_mode": gt.turn_mode,
        "default_loser_penalty": gt.default_loser_penalty,
        "per_point_penalty": gt.per_point_penalty,
    }


@router.post("/game-templates")
def create_game_template(data: GameTemplateCreate, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    wt = data.winner_type if data.winner_type in ("team", "individual") else "individual"
    gt = GameTemplate(
        club_id=user.club_id,
        name=data.name, description=data.description,
        winner_type=WinnerType(wt),
        turn_mode=data.turn_mode if wt == "team" else None,
        is_opener=data.is_opener,
        is_president_game=data.is_president_game,
        default_loser_penalty=data.default_loser_penalty,
        per_point_penalty=data.per_point_penalty,
        sort_order=data.sort_order
    )
    db.add(gt)
    db.commit()
    db.refresh(gt)
    return _template_dict(gt)


@router.put("/game-templates/{gtid}")
def update_game_template(gtid: int, data: GameTemplateCreate, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    gt = db.query(GameTemplate).filter(GameTemplate.id == gtid, GameTemplate.club_id == user.club_id).first()
    if not gt: raise HTTPException(404)
    wt = data.winner_type if data.winner_type in ("team", "individual") else "individual"
    gt.name = data.name
    gt.description = data.description
    gt.winner_type = WinnerType(wt)
    gt.turn_mode = data.turn_mode if wt == "team" else None
    gt.is_opener = data.is_opener
    gt.is_president_game = data.is_president_game
    gt.default_loser_penalty = data.default_loser_penalty
    gt.per_point_penalty = data.per_point_penalty
    gt.sort_order = data.sort_order
    db.commit()
    return _template_dict(gt)


@router.delete("/game-templates/{gtid}")
def delete_game_template(gtid: int, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    gt = db.query(GameTemplate).filter(GameTemplate.id == gtid, GameTemplate.club_id == user.club_id).first()
    if not gt: raise HTTPException(404)
    gt.is_active = False
    db.commit()
    return {"ok": True}


# ── Club Teams ──

def _team_dict(team: ClubTeam) -> dict:
    return {"id": team.id, "name": team.name, "sort_order": team.sort_order}


@router.get("/teams")
def list_club_teams(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    teams = db.query(ClubTeam).filter(
        ClubTeam.club_id == user.club_id, ClubTeam.is_active == True
    ).order_by(ClubTeam.sort_order, ClubTeam.name).all()
    return [_team_dict(t) for t in teams]


class ClubTeamUpsert(BaseModel):
    name: str
    sort_order: int = 0


@router.post("/teams")
def create_club_team(data: ClubTeamUpsert, db: Session = Depends(get_db),
                     user: User = Depends(require_club_admin)):
    team = ClubTeam(club_id=user.club_id, name=data.name, sort_order=data.sort_order)
    db.add(team)
    db.commit()
    db.refresh(team)
    return _team_dict(team)


@router.put("/teams/{tid}")
def update_club_team(tid: int, data: ClubTeamUpsert, db: Session = Depends(get_db),
                     user: User = Depends(require_club_admin)):
    team = db.query(ClubTeam).filter(ClubTeam.id == tid, ClubTeam.club_id == user.club_id).first()
    if not team: raise HTTPException(404)
    team.name = data.name
    team.sort_order = data.sort_order
    db.commit()
    return _team_dict(team)


@router.delete("/teams/{tid}")
def delete_club_team(tid: int, db: Session = Depends(get_db),
                     user: User = Depends(require_club_admin)):
    team = db.query(ClubTeam).filter(ClubTeam.id == tid, ClubTeam.club_id == user.club_id).first()
    if not team: raise HTTPException(404)
    team.is_active = False
    db.commit()
    return {"ok": True}


# ── Member balances & payments ──

def _penalty_euro(l: PenaltyLog) -> float:
    if l.mode == "euro":
        return l.amount
    if l.unit_amount is not None:
        return l.amount * l.unit_amount
    return 0.0


@router.get("/member-balances")
def get_member_balances(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Per-member: total penalties (all evenings), total payments, balance."""
    members = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
    ).order_by(RegularMember.name).all()

    # Build mapping: regular_member_id → list of evening_player_ids
    player_rows = (
        db.query(EveningPlayer.id, EveningPlayer.regular_member_id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(Evening.club_id == user.club_id, EveningPlayer.regular_member_id.isnot(None))
        .all()
    )
    member_player_ids: dict[int, list[int]] = {}
    for pid, mid in player_rows:
        member_player_ids.setdefault(mid, []).append(pid)

    # Penalty totals from penalty_log via player_id (non-absence)
    all_player_ids = [pid for ids in member_player_ids.values() for pid in ids]
    penalty_rows = (
        db.query(PenaltyLog)
        .filter(PenaltyLog.player_id.in_(all_player_ids), PenaltyLog.is_deleted == False)
        .all()
    ) if all_player_ids else []
    penalty_by_player: dict[int, float] = {}
    for l in penalty_rows:
        penalty_by_player[l.player_id] = penalty_by_player.get(l.player_id, 0.0) + _penalty_euro(l)

    # Absence penalties (player_id=null, regular_member_id set directly)
    absence_rows = (
        db.query(PenaltyLog)
        .join(Evening, Evening.id == PenaltyLog.evening_id)
        .filter(
            Evening.club_id == user.club_id,
            PenaltyLog.player_id.is_(None),
            PenaltyLog.regular_member_id.isnot(None),
            PenaltyLog.is_deleted == False,
        )
        .all()
    )
    absence_by_member: dict[int, float] = {}
    for l in absence_rows:
        absence_by_member[l.regular_member_id] = absence_by_member.get(l.regular_member_id, 0.0) + _penalty_euro(l)

    # Payments
    payments = db.query(MemberPayment).filter(
        MemberPayment.club_id == user.club_id, MemberPayment.is_deleted == False
    ).all()
    payments_by_member: dict[int, float] = {}
    for p in payments:
        payments_by_member[p.regular_member_id] = payments_by_member.get(p.regular_member_id, 0.0) + p.amount

    result = []
    for m in members:
        player_ids = member_player_ids.get(m.id, [])
        penalty_total = sum(penalty_by_player.get(pid, 0.0) for pid in player_ids)
        penalty_total += absence_by_member.get(m.id, 0.0)
        payments_total = payments_by_member.get(m.id, 0.0)
        result.append({
            "regular_member_id": m.id,
            "name": m.name,
            "nickname": m.nickname,
            "penalty_total": round(penalty_total, 2),
            "payments_total": round(payments_total, 2),
            "balance": round(payments_total - penalty_total, 2),
        })
    return result


@router.get("/member-payments/{mid}")
def list_member_payments(mid: int, db: Session = Depends(get_db),
                         user: User = Depends(require_club_member)):
    member = db.query(RegularMember).filter(RegularMember.id == mid, RegularMember.club_id == user.club_id).first()
    if not member: raise HTTPException(404)
    payments = db.query(MemberPayment).filter(
        MemberPayment.regular_member_id == mid, MemberPayment.club_id == user.club_id,
        MemberPayment.is_deleted == False,
    ).order_by(MemberPayment.created_at.desc()).all()
    return [{"id": p.id, "amount": p.amount, "note": p.note,
             "created_at": p.created_at.isoformat() if p.created_at else None,
             "updated_at": p.updated_at.isoformat() if p.updated_at else None,
             "date": p.date.isoformat() if p.date else None} for p in payments]


@router.get("/member-penalties/{mid}")
def list_member_penalties(mid: int, db: Session = Depends(get_db),
                          user: User = Depends(require_club_member)):
    """Chronological penalty history for one member, across all evenings.

    Each row's ``amount`` is the penalty's marginal contribution to the member's balance, so the
    balance-history graph's cumulative line matches the canonical balance endpoints. For guests this
    mirrors get_guest_balances: player penalties are capped per evening (a guest's fines within one
    evening never exceed guest_penalty_cap) and absence penalties (player_id null) are excluded
    entirely. Regular members are uncapped and include absence penalties, matching get_member_balances.
    """
    member = db.query(RegularMember).filter(RegularMember.id == mid, RegularMember.club_id == user.club_id).first()
    if not member: raise HTTPException(404)

    guest_cap: float | None = None
    if member.is_guest:
        club = db.query(Club).filter(Club.id == user.club_id).first()
        s = club.settings if club else None
        guest_cap = (s.extra or {}).get("guest_penalty_cap") if s else None

    player_ids = [
        pid for (pid,) in db.query(EveningPlayer.id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(Evening.club_id == user.club_id, EveningPlayer.regular_member_id == mid)
        .all()
    ]

    q = (
        db.query(PenaltyLog, Evening)
        .join(Evening, Evening.id == PenaltyLog.evening_id)
        .filter(
            Evening.club_id == user.club_id,
            PenaltyLog.is_deleted == False,
            or_(
                PenaltyLog.player_id.in_(player_ids),
                and_(PenaltyLog.player_id.is_(None), PenaltyLog.regular_member_id == mid),
            ),
        )
        .order_by(PenaltyLog.created_at.asc())
    )

    # Running raw penalty total per evening, used to compute each guest penalty's capped marginal
    # contribution (min(new, cap) - min(old, cap)), same as the treasury-debt-timeline endpoint.
    evening_raw: dict[int, float] = {}
    result = []
    for log, evening in q.all():
        is_absence = log.player_id is None
        # Guest absence penalties don't count toward the guest balance (mirrors get_guest_balances).
        if member.is_guest and is_absence:
            continue
        raw = _penalty_euro(log)
        if guest_cap is not None and not is_absence:
            old = evening_raw.get(log.evening_id, 0.0)
            new = old + raw
            evening_raw[log.evening_id] = new
            amount = round(min(new, guest_cap) - min(old, guest_cap), 2)
        else:
            amount = raw
        result.append({
            "id": log.id,
            "amount": amount,
            "icon": log.icon,
            "penalty_type_name": log.penalty_type_name,
            "evening_id": log.evening_id,
            "evening_date": evening.date.isoformat() if evening.date else None,
            "is_absence": is_absence,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    return result


class PaymentCreate(BaseModel):
    regular_member_id: int
    amount: float
    note: Optional[str] = None
    date: Optional[str] = None  # ISO date string YYYY-MM-DD for backdating
    idempotency_key: Optional[str] = None


class PaymentUpdate(BaseModel):
    amount: Optional[float] = None
    note: Optional[str] = None
    date: Optional[str] = None  # ISO date string; empty string clears the date


def _payment_dict(p: MemberPayment) -> dict:
    return {"id": p.id, "amount": p.amount, "note": p.note,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "date": p.date.isoformat() if p.date else None}


@router.post("/member-payments", status_code=201)
def create_member_payment(data: PaymentCreate, background_tasks: BackgroundTasks,
                           db: Session = Depends(get_db),
                           user: User = Depends(require_club_admin)):
    if data.amount == 0:
        raise HTTPException(400, "Betrag darf nicht 0 sein")
    if data.idempotency_key:
        existing = db.query(MemberPayment).filter(
            MemberPayment.club_id == user.club_id,
            MemberPayment.idempotency_key == data.idempotency_key,
        ).first()
        if existing:
            return _payment_dict(existing)
    member = db.query(RegularMember).filter(
        RegularMember.id == data.regular_member_id, RegularMember.club_id == user.club_id
    ).first()
    if not member: raise HTTPException(404)
    parsed_date = None
    if data.date:
        try:
            parsed_date = date_type.fromisoformat(data.date)
        except ValueError:
            raise HTTPException(400, "Ungültiges Datum")
    payment = MemberPayment(
        club_id=user.club_id,
        regular_member_id=data.regular_member_id,
        amount=data.amount,
        note=data.note,
        created_by=user.id,
        date=parsed_date,
        idempotency_key=data.idempotency_key,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    logger.info("member payment created: id=%s member=%s amount=%.2f by user=%s",
                payment.id, data.regular_member_id, data.amount, user.id)
    fee = f"{data.amount:.2f}".replace('.', ',')
    background_tasks.add_task(
        push_to_regular_member, db, data.regular_member_id, "💰 Einzahlung erfasst",
        f"+{fee}€ in die Kasse eingetragen.", "/#treasury:bookings", category="payments")
    return _payment_dict(payment)


@router.patch("/member-payments/{pid}")
def update_member_payment(pid: int, data: PaymentUpdate, background_tasks: BackgroundTasks,
                          db: Session = Depends(get_db),
                          user: User = Depends(require_club_admin)):
    p = db.query(MemberPayment).filter(
        MemberPayment.id == pid, MemberPayment.club_id == user.club_id, MemberPayment.is_deleted == False
    ).first()
    if not p: raise HTTPException(404)
    old_amount = p.amount
    if data.amount is not None:
        if data.amount == 0:
            raise HTTPException(400, "Betrag darf nicht 0 sein")
        p.amount = data.amount
    if data.note is not None:
        p.note = data.note.strip() or None
    if data.date is not None:
        if data.date == "":
            p.date = None
        else:
            try:
                p.date = date_type.fromisoformat(data.date)
            except ValueError:
                raise HTTPException(400, "Ungültiges Datum")
    p.updated_at = datetime.now(timezone.utc)
    p.updated_by = user.id
    db.commit()
    db.refresh(p)
    logger.info("member payment updated: id=%s member=%s amount=%.2f→%.2f by user=%s",
                p.id, p.regular_member_id, old_amount, p.amount, user.id)
    if data.amount is not None and data.amount != old_amount:
        old_fee = f"{old_amount:.2f}".replace('.', ',')
        new_fee = f"{p.amount:.2f}".replace('.', ',')
        background_tasks.add_task(
            push_to_regular_member, db, p.regular_member_id, "✏️ Buchung geändert",
            f"Eine Buchung wurde von {old_fee}€ auf {new_fee}€ geändert.", "/#treasury:bookings",
            category="payments")
    return _payment_dict(p)


@router.delete("/member-payments/{pid}", status_code=204)
def delete_member_payment(pid: int, background_tasks: BackgroundTasks, reason: Optional[str] = None,
                           db: Session = Depends(get_db),
                           user: User = Depends(require_club_admin)):
    p = db.query(MemberPayment).filter(
        MemberPayment.id == pid, MemberPayment.club_id == user.club_id, MemberPayment.is_deleted == False
    ).first()
    if not p: raise HTTPException(404)
    p.is_deleted = True
    p.deleted_at = datetime.now(timezone.utc)
    p.deleted_by = user.id
    p.delete_reason = reason
    db.commit()
    logger.info("member payment deleted: id=%s member=%s amount=%.2f by user=%s reason=%s",
                p.id, p.regular_member_id, p.amount, user.id, reason)
    fee = f"{p.amount:.2f}".replace('.', ',')
    background_tasks.add_task(
        push_to_regular_member, db, p.regular_member_id, "🗑️ Buchung storniert",
        f"Eine Buchung über {fee}€ wurde aus deinem Konto entfernt.", "/#treasury:bookings", category="payments")


@router.get("/member-payments")
def list_all_payments(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """All payments for the club, newest first."""
    payments = (
        db.query(MemberPayment, RegularMember)
        .join(RegularMember, RegularMember.id == MemberPayment.regular_member_id)
        .filter(MemberPayment.club_id == user.club_id, MemberPayment.is_deleted == False)
        .order_by(MemberPayment.created_at.desc())
        .all()
    )
    return [{
        "id": p.id, "regular_member_id": p.regular_member_id,
        "member_name": m.nickname or m.name,
        "amount": p.amount, "note": p.note,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        "date": p.date.isoformat() if p.date else None,
    } for p, m in payments]


# ── Guest balances ──

@router.get("/guest-balances")
def get_guest_balances(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Per-guest: total penalties capped per evening, total payments, balance."""
    club = db.query(Club).filter(Club.id == user.club_id).first()
    s = club.settings if club else None
    guest_penalty_cap: float | None = (s.extra or {}).get("guest_penalty_cap") if s else None

    guests = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == True,
    ).order_by(RegularMember.name).all()

    if not guests:
        return []

    # evening_player_id → (regular_member_id, evening_id)
    player_rows = (
        db.query(EveningPlayer.id, EveningPlayer.regular_member_id, EveningPlayer.evening_id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(
            Evening.club_id == user.club_id,
            EveningPlayer.regular_member_id.in_([g.id for g in guests]),
        )
        .all()
    )

    # Maps: player_id → (member_id, evening_id)
    player_info: dict[int, tuple[int, int]] = {pid: (mid, eid) for pid, mid, eid in player_rows}
    all_player_ids = list(player_info.keys())

    # Penalty per player
    penalty_rows = (
        db.query(PenaltyLog)
        .filter(PenaltyLog.player_id.in_(all_player_ids), PenaltyLog.is_deleted == False)
        .all()
    ) if all_player_ids else []

    # Accumulate penalties per (member_id, evening_id)
    penalty_per_evening: dict[tuple[int, int], float] = {}
    for l in penalty_rows:
        mid, eid = player_info[l.player_id]
        key = (mid, eid)
        penalty_per_evening[key] = penalty_per_evening.get(key, 0.0) + _penalty_euro(l)

    # Apply per-evening cap and sum per member
    penalty_by_member: dict[int, float] = {}
    for (mid, _eid), total in penalty_per_evening.items():
        capped = min(total, guest_penalty_cap) if guest_penalty_cap is not None else total
        penalty_by_member[mid] = penalty_by_member.get(mid, 0.0) + capped

    # Payments (guests can also have payments recorded)
    payments = db.query(MemberPayment).filter(
        MemberPayment.club_id == user.club_id,
        MemberPayment.regular_member_id.in_([g.id for g in guests]),
        MemberPayment.is_deleted == False,
    ).all()
    payments_by_member: dict[int, float] = {}
    for p in payments:
        payments_by_member[p.regular_member_id] = payments_by_member.get(p.regular_member_id, 0.0) + p.amount

    result = []
    for g in guests:
        penalty_total = round(penalty_by_member.get(g.id, 0.0), 2)
        payments_total = round(payments_by_member.get(g.id, 0.0), 2)
        if penalty_total == 0.0 and payments_total == 0.0:
            continue  # skip guests with no activity
        result.append({
            "regular_member_id": g.id,
            "name": g.name,
            "nickname": g.nickname,
            "penalty_total": penalty_total,
            "payments_total": payments_total,
            "balance": round(payments_total - penalty_total, 2),
        })
    return result


# ── Treasury debt timeline (balance-history graph) ──

@router.get("/treasury-debt-timeline")
def get_treasury_debt_timeline(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Chronological checkpoints of total outstanding member+guest debt across the club's whole history.

    Used as the 'virtual balance' overlay (actual cash + uncollected debt) on the treasury balance-history
    graph. Mirrors get_member_balances / get_guest_balances semantics (incl. the per-evening guest penalty
    cap), but replays every payment/penalty event chronologically instead of returning today's snapshot.
    """
    club = db.query(Club).filter(Club.id == user.club_id).first()
    s = club.settings if club else None
    guest_cap: float | None = (s.extra or {}).get("guest_penalty_cap") if s else None

    members = db.query(RegularMember).filter(RegularMember.club_id == user.club_id).all()
    if not members:
        return []
    member_ids = [m.id for m in members]
    name_by_id = {m.id: (m.nickname or m.name) for m in members}
    guest_ids = {m.id for m in members if m.is_guest}
    non_guest_ids = [mid for mid in member_ids if mid not in guest_ids]

    player_rows = (
        db.query(EveningPlayer.id, EveningPlayer.regular_member_id, EveningPlayer.evening_id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(Evening.club_id == user.club_id, EveningPlayer.regular_member_id.isnot(None))
        .all()
    )
    player_info: dict[int, tuple[int, int]] = {pid: (mid, eid) for pid, mid, eid in player_rows}
    all_player_ids = list(player_info.keys())

    penalty_rows = (
        db.query(PenaltyLog)
        .join(Evening, Evening.id == PenaltyLog.evening_id)
        .filter(
            Evening.club_id == user.club_id,
            PenaltyLog.is_deleted == False,
            or_(
                PenaltyLog.player_id.in_(all_player_ids),
                and_(PenaltyLog.player_id.is_(None), PenaltyLog.regular_member_id.in_(non_guest_ids)),
            ),
        )
        .all()
    )
    payments = db.query(MemberPayment).filter(
        MemberPayment.club_id == user.club_id,
        MemberPayment.regular_member_id.in_(member_ids),
        MemberPayment.is_deleted == False,
    ).all()

    # Merge penalties (signed debt increases) and payments (debt decreases) into one chronological stream.
    combined: list[tuple] = []
    for log in penalty_rows:
        if log.player_id is not None:
            mid, eid = player_info.get(log.player_id, (None, None))
        else:
            mid, eid = log.regular_member_id, log.evening_id
        if mid is None or log.created_at is None:
            continue
        combined.append((log.created_at, mid, _penalty_euro(log), eid))
    payment_events = [(p.created_at, p.regular_member_id, p.amount) for p in payments if p.created_at is not None]
    combined.sort(key=lambda row: row[0])
    payment_events.sort(key=lambda row: row[0])

    balances: dict[int, float] = {}
    guest_evening_raw: dict[tuple[int, int], float] = {}
    total_debt = 0.0
    checkpoints: list[dict] = []
    prev_rounded: float | None = None

    def apply_delta(mid: int, raw_delta: float, ts):
        nonlocal total_debt, prev_rounded
        old_bal = balances.get(mid, 0.0)
        old_debt = max(0.0, -old_bal)
        new_bal = old_bal + raw_delta
        balances[mid] = new_bal
        new_debt = max(0.0, -new_bal)
        total_debt += (new_debt - old_debt)
        rounded = round(total_debt, 2)
        if rounded != prev_rounded:
            # Attribute this checkpoint to the member whose outstanding debt just moved, so the
            # club-scope overlay points can be labeled player-specific (the change in this member's
            # debt equals the change in the club total, since only one member moves per event).
            checkpoints.append({
                "ts": ts.isoformat(),
                "total_debt": rounded,
                "member_id": mid,
                "member_name": name_by_id.get(mid, ""),
            })
            prev_rounded = rounded

    pi, qi = 0, 0
    while pi < len(combined) or qi < len(payment_events):
        next_penalty = combined[pi] if pi < len(combined) else None
        next_payment = payment_events[qi] if qi < len(payment_events) else None
        if next_payment is None or (next_penalty is not None and next_penalty[0] <= next_payment[0]):
            ts, mid, amount, eid = next_penalty
            if mid in guest_ids and guest_cap is not None:
                key = (mid, eid)
                old_raw = guest_evening_raw.get(key, 0.0)
                new_raw = old_raw + amount
                guest_evening_raw[key] = new_raw
                capped_delta = min(new_raw, guest_cap) - min(old_raw, guest_cap)
                apply_delta(mid, -capped_delta, ts)
            else:
                apply_delta(mid, -amount, ts)
            pi += 1
        else:
            ts, mid, amount = next_payment
            apply_delta(mid, amount, ts)
            qi += 1

    return checkpoints


# ── Guest cost transfer ──

class GuestCostTransfer(BaseModel):
    guest_id: int
    target_member_id: int
    amount: float
    note: Optional[str] = None


@router.post("/guest-cost-transfer", status_code=201)
def transfer_guest_costs(data: GuestCostTransfer, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    """Pass on a guest's outstanding cost to a regular member.

    Stats / PenaltyLog are untouched. Two paired MemberPayment rows are
    created: a positive credit on the guest (offsetting their debt) and a
    negative debit on the target member (taking on the cost).
    """
    if data.amount <= 0:
        raise HTTPException(400, "amount must be positive")
    if data.guest_id == data.target_member_id:
        raise HTTPException(400, "guest and target must differ")

    guest = db.query(RegularMember).filter(
        RegularMember.id == data.guest_id, RegularMember.club_id == user.club_id
    ).first()
    if not guest:
        raise HTTPException(404, "guest not found")
    if not guest.is_guest:
        raise HTTPException(400, "source must be a guest")

    target = db.query(RegularMember).filter(
        RegularMember.id == data.target_member_id, RegularMember.club_id == user.club_id
    ).first()
    if not target:
        raise HTTPException(404, "target member not found")
    if target.is_guest:
        raise HTTPException(400, "target must be a regular member")

    extra = f": {data.note}" if data.note else ""
    transfer_group_id = str(uuid.uuid4())
    guest_payment = MemberPayment(
        club_id=user.club_id,
        regular_member_id=guest.id,
        amount=data.amount,
        note=f"Übertragen auf {target.nickname or target.name}{extra}",
        created_by=user.id,
        transfer_group_id=transfer_group_id,
    )
    target_payment = MemberPayment(
        club_id=user.club_id,
        regular_member_id=target.id,
        amount=-data.amount,
        note=f"Übernommen von {guest.nickname or guest.name}{extra}",
        created_by=user.id,
        transfer_group_id=transfer_group_id,
    )
    db.add_all([guest_payment, target_payment])
    db.commit()
    db.refresh(guest_payment)
    db.refresh(target_payment)
    logger.info("guest cost transfer: %s€ from guest=%s to member=%s by user=%s",
                data.amount, guest.id, target.id, user.id)
    return {
        "guest_payment_id": guest_payment.id,
        "target_payment_id": target_payment.id,
    }


# ── Treasury payout ──

class PayoutEntry(BaseModel):
    regular_member_id: int
    amount: float  # positive = amount to pay out to member (reduces their balance)


class TreasuryPayout(BaseModel):
    payouts: list[PayoutEntry]
    note: Optional[str] = None


@router.post("/treasury-payout", status_code=201)
def create_treasury_payout(data: TreasuryPayout, db: Session = Depends(get_db),
                            user: User = Depends(require_club_admin)):
    """Bulk payout: distribute treasury funds to members as negative payment entries."""
    entries = [e for e in data.payouts if e.amount != 0]
    if not entries:
        raise HTTPException(400, "Keine Beträge angegeben")

    member_ids = [e.regular_member_id for e in entries]
    members = db.query(RegularMember).filter(
        RegularMember.id.in_(member_ids),
        RegularMember.club_id == user.club_id,
    ).all()
    valid_ids = {m.id for m in members}
    for e in entries:
        if e.regular_member_id not in valid_ids:
            raise HTTPException(404, f"Mitglied {e.regular_member_id} nicht gefunden")

    note_text = data.note or "Auszahlung"
    payments = []
    for e in entries:
        payments.append(MemberPayment(
            club_id=user.club_id,
            regular_member_id=e.regular_member_id,
            amount=-abs(e.amount),  # negative = payout from club to member
            note=note_text,
            created_by=user.id,
        ))
    db.add_all(payments)
    db.commit()
    logger.info("Treasury payout: %d entries, total=%.2f by admin=%d",
                len(payments), sum(abs(e.amount) for e in entries), user.id)
    return {"created": len(payments)}


# ── Club expenses ──

class ExpenseCreate(BaseModel):
    amount: float
    description: str
    date: Optional[str] = None  # ISO date string YYYY-MM-DD for backdating
    idempotency_key: Optional[str] = None


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = None
    description: Optional[str] = None
    date: Optional[str] = None  # ISO date string; empty string clears the date


def _serialize_expense(e: ClubExpense) -> dict:
    return {
        "id": e.id, "amount": e.amount, "description": e.description,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
        "date": e.date.isoformat() if e.date else None,
    }


@router.get("/expenses")
def list_expenses(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """All club expenses, newest first."""
    expenses = (
        db.query(ClubExpense)
        .filter(ClubExpense.club_id == user.club_id, ClubExpense.is_deleted == False)
        .order_by(ClubExpense.created_at.desc())
        .all()
    )
    return [_serialize_expense(e) for e in expenses]


@router.post("/expenses", status_code=201)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_admin)):
    if data.amount == 0:
        raise HTTPException(400, "Betrag darf nicht 0 sein")
    if data.idempotency_key:
        existing = db.query(ClubExpense).filter(
            ClubExpense.club_id == user.club_id,
            ClubExpense.idempotency_key == data.idempotency_key,
        ).first()
        if existing:
            return _serialize_expense(existing)
    parsed_date = None
    if data.date:
        try:
            parsed_date = date_type.fromisoformat(data.date)
        except ValueError:
            raise HTTPException(400, "Ungültiges Datum")
    expense = ClubExpense(
        club_id=user.club_id,
        amount=data.amount,
        description=data.description,
        created_by=user.id,
        date=parsed_date,
        idempotency_key=data.idempotency_key,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    logger.info("club expense created: id=%s amount=%.2f by user=%s", expense.id, data.amount, user.id)
    return _serialize_expense(expense)


@router.patch("/expenses/{eid}")
def update_expense(eid: int, data: ExpenseUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_admin)):
    expense = db.query(ClubExpense).filter(
        ClubExpense.id == eid, ClubExpense.club_id == user.club_id, ClubExpense.is_deleted == False
    ).first()
    if not expense:
        raise HTTPException(404)
    old_amount = expense.amount
    if data.amount is not None:
        if data.amount == 0:
            raise HTTPException(400, "Betrag darf nicht 0 sein")
        expense.amount = data.amount
    if data.description is not None:
        if not data.description.strip():
            raise HTTPException(400, "Beschreibung darf nicht leer sein")
        expense.description = data.description.strip()
    if data.date is not None:
        if data.date == "":
            expense.date = None
        else:
            try:
                expense.date = date_type.fromisoformat(data.date)
            except ValueError:
                raise HTTPException(400, "Ungültiges Datum")
    expense.updated_at = datetime.now(timezone.utc)
    expense.updated_by = user.id
    db.commit()
    db.refresh(expense)
    logger.info("club expense updated: id=%s amount=%.2f→%.2f by user=%s",
                expense.id, old_amount, expense.amount, user.id)
    return _serialize_expense(expense)


@router.delete("/expenses/{eid}", status_code=204)
def delete_expense(eid: int, reason: Optional[str] = None, db: Session = Depends(get_db),
                   user: User = Depends(require_club_admin)):
    expense = db.query(ClubExpense).filter(
        ClubExpense.id == eid, ClubExpense.club_id == user.club_id, ClubExpense.is_deleted == False
    ).first()
    if not expense:
        raise HTTPException(404)
    expense.is_deleted = True
    expense.deleted_at = datetime.now(timezone.utc)
    expense.deleted_by = user.id
    expense.delete_reason = reason
    db.commit()
    logger.info("club expense deleted: id=%s amount=%.2f by user=%s reason=%s",
                expense.id, expense.amount, user.id, reason)


# ── My balance (own member) ──

@router.get("/my-balance")
def get_my_balance(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Return the current user's own balance (debt or credit)."""
    if not user.regular_member_id:
        return {"balance": None, "penalty_total": None, "payments_total": None}

    # Player IDs for this member
    player_rows = (
        db.query(EveningPlayer.id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(Evening.club_id == user.club_id, EveningPlayer.regular_member_id == user.regular_member_id)
        .all()
    )
    player_ids = [r[0] for r in player_rows]

    # Penalties via player_id
    penalty_total = 0.0
    if player_ids:
        for l in db.query(PenaltyLog).filter(
            PenaltyLog.player_id.in_(player_ids), PenaltyLog.is_deleted == False
        ).all():
            penalty_total += _penalty_euro(l)

    # Absence penalties
    for l in db.query(PenaltyLog).join(Evening, Evening.id == PenaltyLog.evening_id).filter(
        Evening.club_id == user.club_id,
        PenaltyLog.player_id.is_(None),
        PenaltyLog.regular_member_id == user.regular_member_id,
        PenaltyLog.is_deleted == False,
    ).all():
        penalty_total += _penalty_euro(l)

    # Payments
    payments_total = sum(
        p.amount for p in db.query(MemberPayment).filter(
            MemberPayment.club_id == user.club_id,
            MemberPayment.regular_member_id == user.regular_member_id,
            MemberPayment.is_deleted == False,
        ).all()
    )

    return {
        "regular_member_id": user.regular_member_id,
        "penalty_total": round(penalty_total, 2),
        "payments_total": round(payments_total, 2),
        "balance": round(payments_total - penalty_total, 2),
    }


# ── Payment requests ──

def _fmt_request(r: PaymentRequest, member_name: str) -> dict:
    return {
        "id": r.id,
        "regular_member_id": r.regular_member_id,
        "member_name": member_name,
        "amount": r.amount,
        "note": r.note,
        "status": r.status.value,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
    }


@router.get("/payment-requests")
def list_payment_requests(db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    """Admin: all pending payment requests."""
    rows = (
        db.query(PaymentRequest, RegularMember)
        .join(RegularMember, RegularMember.id == PaymentRequest.regular_member_id)
        .filter(PaymentRequest.club_id == user.club_id,
                PaymentRequest.status == PaymentRequestStatus.pending)
        .order_by(PaymentRequest.created_at.desc())
        .all()
    )
    return [_fmt_request(r, m.nickname or m.name) for r, m in rows]


@router.get("/payment-requests/my")
def list_my_payment_requests(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Current user: own payment requests (all statuses), newest first."""
    if not user.regular_member_id:
        return []
    requests = (
        db.query(PaymentRequest)
        .filter(PaymentRequest.club_id == user.club_id,
                PaymentRequest.regular_member_id == user.regular_member_id)
        .order_by(PaymentRequest.created_at.desc())
        .limit(10)
        .all()
    )
    name = user.name
    return [_fmt_request(r, name) for r in requests]


class PaymentRequestCreate(BaseModel):
    amount: float
    note: Optional[str] = None


@router.post("/payment-requests", status_code=201)
def create_payment_request(data: PaymentRequestCreate,
                           background_tasks: BackgroundTasks,
                           db: Session = Depends(get_db),
                            user: User = Depends(require_club_member)):
    """Member: signal that a PayPal transfer has been made."""
    if not user.regular_member_id:
        raise HTTPException(400, "Kein Roster-Eintrag verknüpft")
    if data.amount <= 0:
        raise HTTPException(400, "Betrag muss positiv sein")
    req = PaymentRequest(
        club_id=user.club_id,
        regular_member_id=user.regular_member_id,
        amount=round(data.amount, 2),
        note=data.note,
        status=PaymentRequestStatus.pending,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    member = db.query(RegularMember).filter(RegularMember.id == user.regular_member_id).first()
    member_display = (member.nickname or member.name) if member else user.name
    fee = f"{req.amount:.2f}".replace('.', ',')
    background_tasks.add_task(
        push_to_club_admins,
        db,
        user.club_id,
        "💸 Neue Zahlungsanfrage",
        f"{member_display} hat {fee}€ überwiesen und wartet auf Bestätigung.",
        f"/#treasury:accounts?rid={req.id}",
        category="payments",
        extra={
            "rid": req.id,
            "tag": f"payment-request-{req.id}",
            "actions": [
                {"action": "confirm", "title": "✅ Genehmigen"},
                {"action": "reject", "title": "❌ Ablehnen"},
            ],
        },
    )
    return _fmt_request(req, member_display)


@router.patch("/payment-requests/{rid}/confirm", status_code=200)
def confirm_payment_request(rid: int, background_tasks: BackgroundTasks,
                             db: Session = Depends(get_db),
                             user: User = Depends(require_club_admin)):
    """Admin: confirm request → creates a MemberPayment and marks request confirmed."""
    req = db.query(PaymentRequest).filter(
        PaymentRequest.id == rid, PaymentRequest.club_id == user.club_id
    ).with_for_update().first()
    if not req:
        raise HTTPException(404)
    if req.status != PaymentRequestStatus.pending:
        raise HTTPException(400, "Anfrage bereits bearbeitet")
    payment = MemberPayment(
        club_id=user.club_id,
        regular_member_id=req.regular_member_id,
        amount=req.amount,
        note=req.note or "PayPal-Überweisung",
        created_by=user.id,
    )
    db.add(payment)
    req.status = PaymentRequestStatus.confirmed
    req.resolved_at = datetime.now(timezone.utc)
    req.resolved_by = user.id
    db.commit()
    db.refresh(req)
    member = db.query(RegularMember).filter(RegularMember.id == req.regular_member_id).first()
    member_name = (member.nickname or member.name) if member else ""
    fee = f"{req.amount:.2f}".replace('.', ',')
    background_tasks.add_task(
        push_to_regular_member, db, req.regular_member_id, "✅ Zahlung bestätigt",
        f"{fee}€ wurden in dein Konto eingetragen.",
        f"/#treasury:bookings?memberName={member_name}", "payments")
    return _fmt_request(req, member_name)


@router.patch("/payment-requests/{rid}/reject", status_code=200)
def reject_payment_request(rid: int, background_tasks: BackgroundTasks,
                            db: Session = Depends(get_db),
                            user: User = Depends(require_club_admin)):
    """Admin: reject a payment request."""
    req = db.query(PaymentRequest).filter(
        PaymentRequest.id == rid, PaymentRequest.club_id == user.club_id
    ).with_for_update().first()
    if not req:
        raise HTTPException(404)
    if req.status != PaymentRequestStatus.pending:
        raise HTTPException(400, "Anfrage bereits bearbeitet")
    req.status = PaymentRequestStatus.rejected
    req.resolved_at = datetime.now(timezone.utc)
    req.resolved_by = user.id
    db.commit()
    db.refresh(req)
    member = db.query(RegularMember).filter(RegularMember.id == req.regular_member_id).first()
    member_name = (member.nickname or member.name) if member else ""
    background_tasks.add_task(
        push_to_regular_member, db, req.regular_member_id, "❌ Zahlung abgelehnt",
        f"Deine Zahlungsanfrage über {req.amount:.2f}€ wurde abgelehnt.",
        f"/#treasury:accounts?member={member.id}&memberName={member_name}", "payments")
    return _fmt_request(req, member_name)


_DEFAULT_REMINDER_SETTINGS: dict = {
    "debt_weekly": {"enabled": False, "weekday": 1, "min_debt": 5.0},
    "upcoming_evening": {"enabled": False, "days_before": 5},
    "rsvp_reminder": {"enabled": False, "days_before": 3},
    "debt_day_of": {"enabled": False},
    "payment_request_nudge": {"enabled": False, "days_pending": 3},
    "auto_report": {"enabled": False, "days_before": 1},
}


@router.get("/reminder-settings")
def get_reminder_settings(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Get club-level reminder configuration."""
    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    extra = (s.extra or {}) if s else {}
    saved = extra.get("reminders", {})
    result: dict = {}
    for key, defaults in _DEFAULT_REMINDER_SETTINGS.items():
        merged = dict(defaults)
        merged.update(saved.get(key, {}))
        result[key] = merged
    return result


class ReminderSettingsUpdate(BaseModel):
    debt_weekly: Optional[dict] = None
    upcoming_evening: Optional[dict] = None
    rsvp_reminder: Optional[dict] = None
    debt_day_of: Optional[dict] = None
    payment_request_nudge: Optional[dict] = None
    auto_report: Optional[dict] = None


@router.patch("/reminder-settings")
def update_reminder_settings(data: ReminderSettingsUpdate, db: Session = Depends(get_db),
                              user: User = Depends(require_club_admin)):
    """Admin: update club-level reminder configuration."""
    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    if not s:
        s = ClubSettings(club_id=user.club_id)
        db.add(s)
    extra = dict(s.extra or {})
    saved = dict(extra.get("reminders", {}))
    payload = data.model_dump(exclude_none=True)
    for key, value in payload.items():
        if key in _DEFAULT_REMINDER_SETTINGS:
            existing = dict(_DEFAULT_REMINDER_SETTINGS[key])
            existing.update(saved.get(key, {}))
            existing.update(value)
            saved[key] = existing
    extra["reminders"] = saved
    s.extra = extra
    db.commit()
    return {"ok": True}


# ── Email (SMTP) server settings — per club ──

_EMAIL_DEFAULTS = {
    "enabled": False,
    "host": "",
    "port": 587,
    "username": "",
    "from_address": "",
    "from_name": "",
    "use_tls": True,
    "use_ssl": False,
    "base_url": "",  # overrides the server-wide APP_BASE_URL for this club's email links (custom domain)
}


@router.get("/email-settings")
def get_email_settings(db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    """Admin: return the club's SMTP config. The password is never returned (only whether it is set)."""
    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    saved = ((s.extra or {}).get("email") or {}) if s else {}
    result = dict(_EMAIL_DEFAULTS)
    for key in _EMAIL_DEFAULTS:
        if key in saved:
            result[key] = saved[key]
    result["password_set"] = bool(saved.get("password"))
    return result


class EmailSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None  # None = keep existing; string = replace
    from_address: Optional[str] = None
    from_name: Optional[str] = None
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None
    base_url: Optional[str] = None  # e.g. "https://kegeln.meinverein.de" — empty string clears it


@router.patch("/email-settings")
def update_email_settings(data: EmailSettingsUpdate, db: Session = Depends(get_db),
                          user: User = Depends(require_club_admin)):
    """Admin: update the club's SMTP config. Password is only changed when provided."""
    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    if not s:
        s = ClubSettings(club_id=user.club_id)
        db.add(s)
    from core.crypto import encrypt_secret
    extra = dict(s.extra or {})
    cfg = dict(extra.get("email", {}))
    payload = data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        if key == "password":
            if value:  # only overwrite when a non-empty password is supplied — encrypted at rest
                cfg["password"] = encrypt_secret(value)
            continue
        cfg[key] = value
    extra["email"] = cfg
    s.extra = extra
    db.commit()
    result = dict(_EMAIL_DEFAULTS)
    for key in _EMAIL_DEFAULTS:
        if key in cfg:
            result[key] = cfg[key]
    result["password_set"] = bool(cfg.get("password"))
    return result


class TestEmailRequest(BaseModel):
    to: Optional[str] = None


@router.post("/email-settings/test")
def test_email_settings(data: TestEmailRequest = TestEmailRequest(), db: Session = Depends(get_db),
                        user: User = Depends(require_club_admin)):
    """Admin: send a test email using the saved SMTP config (to the given address or self)."""
    from core.email import build_email_bodies, email_theme, get_club_email_config, send_club_email
    club = db.query(Club).filter(Club.id == user.club_id).first()
    cfg = get_club_email_config(club)
    if not cfg:
        raise HTTPException(400, "E-Mail-Versand ist nicht konfiguriert oder deaktiviert.")
    to_address = (data.to or user.email or "").strip()
    if not to_address:
        raise HTTPException(400, "Keine Empfängeradresse angegeben.")
    subject = "Kegelkasse 🎳 — Test-E-Mail"
    body = "Diese Test-E-Mail bestätigt, dass der E-Mail-Versand für deinen Verein funktioniert."
    text, html = build_email_bodies(subject, body, "/", theme=email_theme(club),
                                    locale=user.preferred_locale)
    try:
        send_club_email(cfg, to_address, subject, text, html)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Test email failed for club %s: %s", user.club_id, exc)
        raise HTTPException(400, f"E-Mail konnte nicht gesendet werden: {exc}")
    logger.info("Test email sent for club %s to %s", user.club_id, to_address)
    return {"ok": True, "sent_to": to_address}


class BroadcastPushRequest(BaseModel):
    title: str
    body: str
    url: str = "/"


@router.post("/broadcast-push")
def broadcast_push(data: BroadcastPushRequest, background_tasks: BackgroundTasks,
                   db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    """Admin: send a custom push notification to all club members (async background)."""
    from core.push import push_to_club
    background_tasks.add_task(push_to_club, db, user.club_id, data.title, data.body, data.url)
    return {"ok": True}


@router.post("/remind-debtors", status_code=200)
def remind_debtors(background_tasks: BackgroundTasks, db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    """Admin: send push notification to every member with outstanding debt."""
    members = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
    ).all()

    player_rows = (
        db.query(EveningPlayer.id, EveningPlayer.regular_member_id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(Evening.club_id == user.club_id, EveningPlayer.regular_member_id.isnot(None))
        .all()
    )
    member_player_ids: dict[int, list[int]] = {}
    for pid, mid in player_rows:
        member_player_ids.setdefault(mid, []).append(pid)

    all_player_ids = [pid for ids in member_player_ids.values() for pid in ids]
    penalty_rows = (
        db.query(PenaltyLog)
        .filter(PenaltyLog.player_id.in_(all_player_ids), PenaltyLog.is_deleted == False)
        .all()
    ) if all_player_ids else []
    penalty_by_player: dict[int, float] = {}
    for log in penalty_rows:
        penalty_by_player[log.player_id] = penalty_by_player.get(log.player_id, 0.0) + _penalty_euro(log)

    absence_rows = (
        db.query(PenaltyLog)
        .join(Evening, Evening.id == PenaltyLog.evening_id)
        .filter(
            Evening.club_id == user.club_id,
            PenaltyLog.player_id.is_(None),
            PenaltyLog.regular_member_id.isnot(None),
            PenaltyLog.is_deleted == False,
        )
        .all()
    )
    absence_by_member: dict[int, float] = {}
    for log in absence_rows:
        absence_by_member[log.regular_member_id] = absence_by_member.get(log.regular_member_id, 0.0) + _penalty_euro(log)

    payments = db.query(MemberPayment).filter(
        MemberPayment.club_id == user.club_id, MemberPayment.is_deleted == False
    ).all()
    payments_by_member: dict[int, float] = {}
    for p in payments:
        payments_by_member[p.regular_member_id] = payments_by_member.get(p.regular_member_id, 0.0) + p.amount

    reminded = 0
    for m in members:
        player_ids = member_player_ids.get(m.id, [])
        penalty_total = sum(penalty_by_player.get(pid, 0.0) for pid in player_ids)
        penalty_total += absence_by_member.get(m.id, 0.0)
        payments_total = payments_by_member.get(m.id, 0.0)
        balance = round(payments_total - penalty_total, 2)
        if balance < -0.01:
            debt_str = f"{abs(balance):.2f}".replace('.', ',')
            background_tasks.add_task(
                push_to_regular_member, db, m.id,
                "💳 Offener Betrag",
                f"Du hast noch {debt_str}€ offen in der Vereinskasse.",
                f"/#treasury:accounts?member={m.id}&memberName={m.nickname or m.name}",
            )
            reminded += 1
    return {"reminded_count": reminded}


# ── Club pins ──

def _pin_dict(p: ClubPin) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "icon": p.icon,
        "holder_regular_member_id": p.holder_regular_member_id,
        "holder_name": p.holder_name,
        "assigned_at": p.assigned_at.isoformat() if p.assigned_at else None,
    }


@router.get("/pins")
def list_pins(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """All club pins with current holder."""
    pins = db.query(ClubPin).filter(ClubPin.club_id == user.club_id).order_by(ClubPin.id).all()
    return [_pin_dict(p) for p in pins]


class PinCreate(BaseModel):
    name: str
    icon: Optional[str] = "📌"


@router.post("/pins", status_code=201)
def create_pin(data: PinCreate, db: Session = Depends(get_db),
               user: User = Depends(require_club_admin)):
    pin = ClubPin(
        club_id=user.club_id,
        name=data.name,
        icon=data.icon or "📌",
    )
    db.add(pin)
    db.commit()
    db.refresh(pin)
    return _pin_dict(pin)


class PinUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    holder_regular_member_id: Optional[int] = None  # None = clear holder
    assigned_at: Optional[str] = None  # ISO date string to override assignment date


@router.put("/pins/{pid}")
def update_pin(pid: int, data: PinUpdate, db: Session = Depends(get_db),
               user: User = Depends(require_club_admin)):
    pin = db.query(ClubPin).filter(ClubPin.id == pid, ClubPin.club_id == user.club_id).first()
    if not pin:
        raise HTTPException(404)
    if data.name is not None:
        pin.name = data.name
    if data.icon is not None:
        pin.icon = data.icon
    # Assign / clear holder (explicit None clears, missing key = no change)
    payload = data.model_dump(exclude_unset=True)
    if "holder_regular_member_id" in payload:
        mid = payload["holder_regular_member_id"]
        if mid is not None:
            member = db.query(RegularMember).filter(
                RegularMember.id == mid, RegularMember.club_id == user.club_id
            ).first()
            if not member:
                raise HTTPException(404, "Mitglied nicht gefunden")
            pin.holder_regular_member_id = mid
            pin.holder_name = member.name
            pin.assigned_at = datetime.now(timezone.utc)
        else:
            pin.holder_regular_member_id = None
            pin.holder_name = None
            pin.assigned_at = None
    # Allow explicit override of assigned_at date
    if data.assigned_at is not None and pin.holder_regular_member_id is not None:
        try:
            pin.assigned_at = datetime.fromisoformat(data.assigned_at).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    db.commit()
    return _pin_dict(pin)


@router.delete("/pins/{pid}", status_code=204)
def delete_pin(pid: int, db: Session = Depends(get_db),
               user: User = Depends(require_club_admin)):
    pin = db.query(ClubPin).filter(ClubPin.id == pid, ClubPin.club_id == user.club_id).first()
    if not pin:
        raise HTTPException(404)
    db.delete(pin)
    db.commit()



# ── Committee member management ───────────────────────────────────────────────

class CommitteeToggle(BaseModel):
    is_committee: bool


@router.patch("/members/{mid}/committee")
def set_committee_member(
    mid: int,
    data: CommitteeToggle,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """Toggle the is_committee flag for a regular member (admin only)."""
    member = db.query(RegularMember).filter(
        RegularMember.id == mid, RegularMember.club_id == user.club_id
    ).first()
    if not member:
        raise HTTPException(404, "Member not found")
    member.is_committee = data.is_committee
    db.commit()
    return {"id": member.id, "is_committee": member.is_committee}

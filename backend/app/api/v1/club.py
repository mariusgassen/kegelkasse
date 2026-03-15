"""
Club management — settings, regular members, penalty types, game templates.
All write operations require club_admin role.
Read operations available to all club members.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_club_admin
from core.database import get_db
from models.club import Club, ClubSettings
from models.evening import RegularMember
from models.game import GameTemplate, WinnerType
from models.penalty import PenaltyType
from models.user import User, UserRole

router = APIRouter(prefix="/club", tags=["club"])


# ── Club info & settings ──

@router.get("/")
def get_club(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    club = db.query(Club).filter(Club.id == user.club_id).first()
    if not club: raise HTTPException(404)
    s = club.settings
    return {
        "id": club.id, "name": club.name, "slug": club.slug,
        "settings": {
            "home_venue": s.home_venue if s else None,
            "logo_url": s.logo_url if s else None,
            "primary_color": s.primary_color if s else "#e8a020",
            "secondary_color": s.secondary_color if s else "#6b7c5a",
        } if s else {}
    }


class ClubSettingsUpdate(BaseModel):
    home_venue: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None


@router.patch("/settings")
def update_club_settings(data: ClubSettingsUpdate, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    """Admin only: update club settings (home venue, colors)."""
    s = db.query(ClubSettings).filter(ClubSettings.club_id == user.club_id).first()
    if not s:
        s = ClubSettings(club_id=user.club_id)
        db.add(s)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    db.commit()
    return {"ok": True}


@router.get("/members")
def get_members(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    users = db.query(User).filter(User.club_id == user.club_id, User.is_active == True).all()
    return [{"id": u.id, "name": u.name, "role": u.role} for u in users]


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
    return {"ok": True}


# ── Regular members (Stammspieler) — admin write, all read ──

@router.get("/regular-members")
def list_regular_members(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    return db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id, RegularMember.is_active == True
    ).order_by(RegularMember.name).all()


class RegularMemberCreate(BaseModel):
    name: str
    nickname: Optional[str] = None


@router.post("/regular-members")
def create_regular_member(data: RegularMemberCreate, db: Session = Depends(get_db),
                          user: User = Depends(require_club_admin)):
    m = RegularMember(club_id=user.club_id, name=data.name, nickname=data.nickname)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"id": m.id, "name": m.name, "nickname": m.nickname}


@router.put("/regular-members/{mid}")
def update_regular_member(mid: int, data: RegularMemberCreate, db: Session = Depends(get_db),
                          user: User = Depends(require_club_admin)):
    m = db.query(RegularMember).filter(RegularMember.id == mid, RegularMember.club_id == user.club_id).first()
    if not m: raise HTTPException(404)
    m.name = data.name
    if data.nickname is not None: m.nickname = data.nickname
    db.commit()
    return {"id": m.id, "name": m.name, "nickname": m.nickname}


@router.delete("/regular-members/{mid}")
def delete_regular_member(mid: int, db: Session = Depends(get_db),
                          user: User = Depends(require_club_admin)):
    m = db.query(RegularMember).filter(RegularMember.id == mid, RegularMember.club_id == user.club_id).first()
    if not m: raise HTTPException(404)
    m.is_active = False
    db.commit()
    return {"ok": True}


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
    winner_type: str = "either"
    is_opener: bool = False
    default_loser_penalty: float = 0
    sort_order: int = 0


@router.post("/game-templates")
def create_game_template(data: GameTemplateCreate, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    gt = GameTemplate(
        club_id=user.club_id,
        name=data.name, description=data.description,
        winner_type=WinnerType(data.winner_type),
        is_opener=data.is_opener,
        default_loser_penalty=data.default_loser_penalty,
        sort_order=data.sort_order
    )
    db.add(gt)
    db.commit()
    db.refresh(gt)
    return {"id": gt.id, "name": gt.name, "is_opener": gt.is_opener,
            "winner_type": gt.winner_type, "default_loser_penalty": gt.default_loser_penalty}


@router.put("/game-templates/{gtid}")
def update_game_template(gtid: int, data: GameTemplateCreate, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    gt = db.query(GameTemplate).filter(GameTemplate.id == gtid, GameTemplate.club_id == user.club_id).first()
    if not gt: raise HTTPException(404)
    gt.name = data.name
    gt.description = data.description
    gt.winner_type = WinnerType(data.winner_type)
    gt.is_opener = data.is_opener
    gt.default_loser_penalty = data.default_loser_penalty
    gt.sort_order = data.sort_order
    db.commit()
    return {"id": gt.id, "name": gt.name}


@router.delete("/game-templates/{gtid}")
def delete_game_template(gtid: int, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    gt = db.query(GameTemplate).filter(GameTemplate.id == gtid, GameTemplate.club_id == user.club_id).first()
    if not gt: raise HTTPException(404)
    gt.is_active = False
    db.commit()
    return {"ok": True}

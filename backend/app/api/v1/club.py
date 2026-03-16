"""
Club management — settings, regular members, penalty types, game templates.
All write operations require club_admin role.
Read operations available to all club members.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_club_admin
from core.database import get_db
from models.club import Club, ClubSettings
from models.evening import RegularMember, ClubTeam, EveningPlayer, Evening
from models.game import GameTemplate, WinnerType
from models.payment import MemberPayment
from models.penalty import PenaltyType, PenaltyLog
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
            "bg_color": (s.extra or {}).get("bg_color") if s else None,
            "guest_penalty_cap": (s.extra or {}).get("guest_penalty_cap") if s else None,
        } if s else {}
    }


class ClubSettingsUpdate(BaseModel):
    home_venue: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    bg_color: Optional[str] = None
    guest_penalty_cap: Optional[float] = None
    name: Optional[str] = None  # club name rename


_SETTINGS_COLUMNS = {"home_venue", "primary_color", "secondary_color"}
_SETTINGS_EXTRA = {"bg_color", "guest_penalty_cap"}


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


@router.get("/members")
def get_members(include_inactive: bool = False, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    q = db.query(User).filter(User.club_id == user.club_id)
    if not include_inactive:
        q = q.filter(User.is_active == True)
    users = q.order_by(User.name).all()
    return [{"id": u.id, "name": u.name, "role": u.role,
             "regular_member_id": u.regular_member_id, "is_active": u.is_active,
             "avatar": u.avatar} for u in users]


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
            "is_guest": m.is_guest, "is_active": m.is_active, "avatar": avatar}


@router.get("/regular-members")
def list_regular_members(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    rows = (db.query(RegularMember, User.avatar)
            .outerjoin(User, User.id == RegularMember.user_id)
            .filter(RegularMember.club_id == user.club_id, RegularMember.is_active == True)
            .order_by(RegularMember.name)
            .all())
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
    m.is_active = False
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
    expires = datetime.now(datetime.UTC) + timedelta(days=7)
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
    payments = db.query(MemberPayment).filter(MemberPayment.club_id == user.club_id).all()
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
        MemberPayment.regular_member_id == mid, MemberPayment.club_id == user.club_id
    ).order_by(MemberPayment.created_at.desc()).all()
    return [{"id": p.id, "amount": p.amount, "note": p.note,
             "created_at": p.created_at.isoformat() if p.created_at else None} for p in payments]


class PaymentCreate(BaseModel):
    regular_member_id: int
    amount: float
    note: Optional[str] = None


@router.post("/member-payments", status_code=201)
def create_member_payment(data: PaymentCreate, db: Session = Depends(get_db),
                           user: User = Depends(require_club_admin)):
    member = db.query(RegularMember).filter(
        RegularMember.id == data.regular_member_id, RegularMember.club_id == user.club_id
    ).first()
    if not member: raise HTTPException(404)
    payment = MemberPayment(
        club_id=user.club_id,
        regular_member_id=data.regular_member_id,
        amount=data.amount,
        note=data.note,
        created_by=user.id,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {"id": payment.id, "amount": payment.amount, "note": payment.note,
            "created_at": payment.created_at.isoformat() if payment.created_at else None}


@router.delete("/member-payments/{pid}", status_code=204)
def delete_member_payment(pid: int, db: Session = Depends(get_db),
                           user: User = Depends(require_club_admin)):
    p = db.query(MemberPayment).filter(MemberPayment.id == pid, MemberPayment.club_id == user.club_id).first()
    if not p: raise HTTPException(404)
    db.delete(p)
    db.commit()


@router.get("/member-payments")
def list_all_payments(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """All payments for the club, newest first."""
    payments = (
        db.query(MemberPayment, RegularMember)
        .join(RegularMember, RegularMember.id == MemberPayment.regular_member_id)
        .filter(MemberPayment.club_id == user.club_id)
        .order_by(MemberPayment.created_at.desc())
        .all()
    )
    return [{
        "id": p.id, "regular_member_id": p.regular_member_id,
        "member_name": m.nickname or m.name,
        "amount": p.amount, "note": p.note,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    } for p, m in payments]

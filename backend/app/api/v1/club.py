"""
Club management — settings, regular members, penalty types, game templates.
All write operations require club_admin role.
Read operations available to all club members.
"""
from datetime import date as date_type, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
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
            "is_guest": m.is_guest, "is_active": m.is_active,
            "is_committee": m.is_committee, "avatar": avatar}


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
    winner_type: str = "either"
    is_opener: bool = False
    is_president_game: bool = False
    default_loser_penalty: float = 0
    per_point_penalty: float = 0
    sort_order: int = 0


@router.post("/game-templates")
def create_game_template(data: GameTemplateCreate, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    gt = GameTemplate(
        club_id=user.club_id,
        name=data.name, description=data.description,
        winner_type=WinnerType(data.winner_type),
        is_opener=data.is_opener,
        is_president_game=data.is_president_game,
        default_loser_penalty=data.default_loser_penalty,
        per_point_penalty=data.per_point_penalty,
        sort_order=data.sort_order
    )
    db.add(gt)
    db.commit()
    db.refresh(gt)
    return {"id": gt.id, "name": gt.name, "is_opener": gt.is_opener,
            "is_president_game": gt.is_president_game,
            "winner_type": gt.winner_type, "default_loser_penalty": gt.default_loser_penalty,
            "per_point_penalty": gt.per_point_penalty}


@router.put("/game-templates/{gtid}")
def update_game_template(gtid: int, data: GameTemplateCreate, db: Session = Depends(get_db),
                         user: User = Depends(require_club_admin)):
    gt = db.query(GameTemplate).filter(GameTemplate.id == gtid, GameTemplate.club_id == user.club_id).first()
    if not gt: raise HTTPException(404)
    gt.name = data.name
    gt.description = data.description
    gt.winner_type = WinnerType(data.winner_type)
    gt.is_opener = data.is_opener
    gt.is_president_game = data.is_president_game
    gt.default_loser_penalty = data.default_loser_penalty
    gt.per_point_penalty = data.per_point_penalty
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
    fee = f"{data.amount:.2f}".replace('.', ',')
    push_to_regular_member(db, data.regular_member_id, "💰 Einzahlung erfasst",
                           f"+{fee}€ in die Kasse eingetragen.", "/#treasury:bookings", category="payments")
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


# ── Club expenses ──

class ExpenseCreate(BaseModel):
    amount: float
    description: str
    date: Optional[str] = None  # ISO date string YYYY-MM-DD for backdating


def _serialize_expense(e: ClubExpense) -> dict:
    return {
        "id": e.id, "amount": e.amount, "description": e.description,
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "date": e.date.isoformat() if e.date else None,
    }


@router.get("/expenses")
def list_expenses(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """All club expenses, newest first."""
    expenses = (
        db.query(ClubExpense)
        .filter(ClubExpense.club_id == user.club_id)
        .order_by(ClubExpense.created_at.desc())
        .all()
    )
    return [_serialize_expense(e) for e in expenses]


@router.post("/expenses", status_code=201)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_admin)):
    if data.amount == 0:
        raise HTTPException(400, "Betrag darf nicht 0 sein")
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
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _serialize_expense(expense)


@router.delete("/expenses/{eid}", status_code=204)
def delete_expense(eid: int, db: Session = Depends(get_db),
                   user: User = Depends(require_club_admin)):
    expense = db.query(ClubExpense).filter(
        ClubExpense.id == eid, ClubExpense.club_id == user.club_id
    ).first()
    if not expense:
        raise HTTPException(404)
    db.delete(expense)
    db.commit()


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
def confirm_payment_request(rid: int, db: Session = Depends(get_db),
                             user: User = Depends(require_club_admin)):
    """Admin: confirm request → creates a MemberPayment and marks request confirmed."""
    req = db.query(PaymentRequest).filter(
        PaymentRequest.id == rid, PaymentRequest.club_id == user.club_id
    ).first()
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
    push_to_regular_member(db, req.regular_member_id, "✅ Zahlung bestätigt",
                           f"{fee}€ wurden in dein Konto eingetragen.",
                           f"/#treasury:bookings?memberName={member_name}", category="payments")
    return _fmt_request(req, member_name)


@router.patch("/payment-requests/{rid}/reject", status_code=200)
def reject_payment_request(rid: int, db: Session = Depends(get_db),
                            user: User = Depends(require_club_admin)):
    """Admin: reject a payment request."""
    req = db.query(PaymentRequest).filter(
        PaymentRequest.id == rid, PaymentRequest.club_id == user.club_id
    ).first()
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
    push_to_regular_member(db, req.regular_member_id, "❌ Zahlung abgelehnt",
                           f"Deine Zahlungsanfrage über {req.amount:.2f}€ wurde abgelehnt.",
                           f"/#treasury:accounts?member={member.id}&memberName={member_name}", category="payments")
    return _fmt_request(req, member_name)


_DEFAULT_REMINDER_SETTINGS: dict = {
    "debt_weekly": {"enabled": False, "weekday": 1, "min_debt": 5.0},
    "upcoming_evening": {"enabled": False, "days_before": 5},
    "rsvp_reminder": {"enabled": False, "days_before": 3},
    "debt_day_of": {"enabled": False},
    "payment_request_nudge": {"enabled": False, "days_pending": 3},
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
def remind_debtors(db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
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

    payments = db.query(MemberPayment).filter(MemberPayment.club_id == user.club_id).all()
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
            push_to_regular_member(
                db, m.id,
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

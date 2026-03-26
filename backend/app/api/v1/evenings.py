"""Evening management — CRUD for evenings, players, teams, penalties, games, drinks."""
import asyncio
import logging
from datetime import datetime, UTC
from typing import Optional, List

from babel.dates import format_datetime
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette import status

from api.deps import require_club_member, require_club_admin
from core.events import event_bus
from core.push import push_to_regular_member, push_to_club
from core.security import decode_token
from core.database import get_db, AsyncSessionLocal
from sqlalchemy import select, cast, Date as SQLDate
from models.drink import DrinkRound, DrinkType
from models.club import ClubSettings
from models.evening import Evening, EveningPlayer, Team, ClubTeam, RegularMember, EveningHighlight
from models.game import Game, WinnerType, GameThrowLog
from models.penalty import PenaltyLog, PenaltyMode
from models.schedule import ScheduledEvening, MemberRsvp, RsvpStatus
from models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/evening", tags=["evening"])


# ── Helpers ──

def get_club_evening(evening_id: int, user: User, db: Session) -> Evening:
    e = db.query(Evening).filter(Evening.id == evening_id, Evening.club_id == user.club_id).first()
    if not e: raise HTTPException(404, "Evening not found")
    return e


def _parse_date(s: str) -> datetime:
    """Accept YYYY-MM-DD or full ISO datetime and return timezone-aware datetime (20:00 UTC if date-only)."""
    if len(s) == 10:
        return datetime(int(s[:4]), int(s[5:7]), int(s[8:10]), 20, 0, 0, tzinfo=UTC)
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def serialize_evening(e: Evening) -> dict:
    return {
        "id": e.id, "date": e.date.isoformat() if e.date else None, "venue": e.venue, "note": e.note,
        "is_closed": e.is_closed,
        "players": [{"id": p.id, "name": p.name, "regular_member_id": p.regular_member_id,
                     "team_id": p.team_id, "is_king": p.is_king} for p in e.players],
        "teams": [{"id": t.id, "name": t.name} for t in e.teams],
        "penalty_log": [{"id": l.id, "player_id": l.player_id, "team_id": l.team_id,
                         "regular_member_id": l.regular_member_id,
                         "game_id": l.game_id,
                         "player_name": l.player_name, "penalty_type_name": l.penalty_type_name,
                         "icon": l.icon, "amount": l.amount, "mode": l.mode,
                         "unit_amount": l.unit_amount,
                         "client_timestamp": l.client_timestamp}
                        for l in e.penalty_log if not l.is_deleted],
        "games": [{"id": g.id, "name": g.name, "is_opener": g.is_opener,
                   "is_president_game": g.is_president_game,
                   "winner_type": g.winner_type, "winner_ref": g.winner_ref,
                   "winner_name": g.winner_name, "scores": g.scores,
                   "loser_penalty": g.loser_penalty, "per_point_penalty": g.per_point_penalty, "note": g.note,
                   "sort_order": g.sort_order, "template_id": g.template_id,
                   "status": g.status,
                   "started_at": g.started_at.isoformat() if g.started_at else None,
                   "finished_at": g.finished_at.isoformat() if g.finished_at else None,
                   "client_timestamp": g.client_timestamp,
                   "turn_mode": g.turn_mode,
                   "active_player_id": g.active_player_id,
                   "throws": [{"id": t.id, "throw_num": t.throw_num, "pins": t.pins,
                                "cumulative": t.cumulative, "pin_states": t.pin_states,
                                "player_id": t.player_id}
                               for t in g.throws]}
                  for g in e.games if not g.is_deleted],
        "drink_rounds": [{"id": r.id, "drink_type": r.drink_type, "variety": r.variety,
                          "participant_ids": r.participant_ids,
                          "client_timestamp": r.client_timestamp}
                         for r in e.drink_rounds if not r.is_deleted],
        "highlights": [{"id": h.id, "text": h.text, "media_url": h.media_url,
                        "created_at": h.created_at.isoformat() if h.created_at else None}
                       for h in e.highlights],
    }


# ── Evening CRUD ──

@router.get("/")
def list_evenings(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    items = db.query(Evening).filter(Evening.club_id == user.club_id).order_by(Evening.date.desc()).all()
    return [{"id": e.id, "date": e.date.isoformat() if e.date else None, "venue": e.venue,
             "is_closed": e.is_closed, "player_count": len(e.players)} for e in items]


class EveningCreate(BaseModel):
    date: str
    venue: Optional[str] = None
    note: Optional[str] = None


@router.post("/")
def create_evening(data: EveningCreate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_admin)):
    other_open = db.query(Evening).filter(
        Evening.club_id == user.club_id,
        Evening.is_closed == False,
    ).first()
    if other_open:
        raise HTTPException(400, "Another evening is already active")
    payload = data.model_dump()
    payload["date"] = _parse_date(payload["date"])
    e = Evening(club_id=user.club_id, created_by=user.id, **payload)
    db.add(e)
    db.commit()
    db.refresh(e)
    logger.info("Evening created: id=%s date=%s club_id=%s by user_id=%s", e.id, e.date, user.club_id, user.id)
    return serialize_evening(e)


@router.get("/{eid}")
def get_evening(eid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    return serialize_evening(get_club_evening(eid, user, db))


class EveningUpdate(BaseModel):
    date: Optional[str] = None
    venue: Optional[str] = None
    note: Optional[str] = None
    is_closed: Optional[bool] = None


@router.patch("/{eid}")
def update_evening(eid: int,
                   data: EveningUpdate,
                   background_tasks: BackgroundTasks,
                   db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    was_open = not e.is_closed
    updates = data.model_dump(exclude_none=True)
    # Reopening: ensure no other evening is currently open for this club
    if updates.get("is_closed") is False and e.is_closed:
        other_open = db.query(Evening).filter(
            Evening.club_id == e.club_id,
            Evening.id != e.id,
            Evening.is_closed == False,
        ).first()
        if other_open:
            raise HTTPException(400, "Another evening is already active")
    if "date" in updates:
        updates["date"] = _parse_date(updates["date"])
    for k, v in updates.items(): setattr(e, k, v)
    db.commit()
    db.refresh(e)
    if was_open and e.is_closed:
        logger.info("Evening closed: id=%s date=%s club_id=%s by user_id=%s", e.id, e.date, e.club_id, user.id)
        # Auto-calculate absence penalties on close
        if e.players:
            _do_calculate_absence_penalties(e, background_tasks, db, user.id)
        background_tasks.add_task(
            push_to_club,
            db, e.club_id, "Abend beendet 🎳",
            f"Abend vom {e.date.strftime('%d.%m.%Y')} wurde abgeschlossen.",
            f"/#schedule?evening={e.id}", category="evenings"
        )
    return serialize_evening(e)


@router.delete("/{eid}", status_code=204)
def delete_evening(eid: int, db: Session = Depends(get_db),
                   user: User = Depends(require_club_admin)):
    e = get_club_evening(eid, user, db)
    db.delete(e)
    db.commit()


# ── Players ──

class PlayerCreate(BaseModel):
    name: str
    regular_member_id: Optional[int] = None
    team_id: Optional[int] = None


@router.post("/{eid}/players")
def add_player(eid: int, data: PlayerCreate, db: Session = Depends(get_db),
               user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    teams_exist = db.query(Team).filter(Team.evening_id == e.id).first() is not None
    if teams_exist and data.team_id is None:
        raise HTTPException(400, "team_id is required when the evening has teams")
    p = EveningPlayer(evening_id=e.id, **data.model_dump())
    db.add(p)
    db.commit()
    return {"id": p.id, "name": p.name, "team_id": p.team_id}


class PlayerUpdate(BaseModel):
    name: Optional[str] = None
    team_id: Optional[int] = None


@router.patch("/{eid}/players/{pid}")
def update_player(eid: int, pid: int, data: PlayerUpdate, db: Session = Depends(get_db),
                  user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    p = db.query(EveningPlayer).filter(EveningPlayer.id == pid, EveningPlayer.evening_id == e.id).first()
    if not p: raise HTTPException(404)
    for k, v in data.model_dump(exclude_none=True).items(): setattr(p, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/{eid}/players/{pid}")
def remove_player(eid: int, pid: int, db: Session = Depends(get_db),
                  user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    p = db.query(EveningPlayer).filter(EveningPlayer.id == pid, EveningPlayer.evening_id == e.id).first()
    if not p: raise HTTPException(404)
    # Delete penalty log entries that reference this player
    db.query(PenaltyLog).filter(PenaltyLog.player_id == pid).delete(synchronize_session=False)
    # Remove player from drink round participant lists
    for dr in db.query(DrinkRound).filter(DrinkRound.evening_id == e.id).all():
        if pid in (dr.participant_ids or []):
            dr.participant_ids = [x for x in dr.participant_ids if x != pid]
    # Clean up game scores and winner refs
    player_key = f"p:{pid}"
    for g in db.query(Game).filter(Game.evening_id == e.id, Game.is_deleted == False).all():
        if g.scores and player_key in g.scores:
            g.scores = {k: v for k, v in g.scores.items() if k != player_key}
        if g.winner_ref == player_key:
            g.winner_ref = None
            g.winner_name = None
    db.delete(p)
    db.commit()
    return {"ok": True}


# ── Teams ──

class TeamCreate(BaseModel):
    name: str
    player_ids: List[int] = []


@router.post("/{eid}/teams")
def create_team(eid: int, data: TeamCreate, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    t = Team(evening_id=e.id, name=data.name)
    db.add(t)
    db.flush()
    for pid in data.player_ids:
        p = db.query(EveningPlayer).filter(EveningPlayer.id == pid, EveningPlayer.evening_id == e.id).first()
        if p: p.team_id = t.id
    db.commit()
    return {"id": t.id, "name": t.name}


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    player_ids: Optional[List[int]] = None


@router.patch("/{eid}/teams/{tid}")
def update_team(eid: int, tid: int, data: TeamUpdate, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    t = db.query(Team).filter(Team.id == tid, Team.evening_id == e.id).first()
    if not t: raise HTTPException(404)
    if data.name: t.name = data.name
    if data.player_ids is not None:
        db.query(EveningPlayer).filter(EveningPlayer.team_id == tid).update({"team_id": None})
        for pid in data.player_ids:
            p = db.query(EveningPlayer).filter(EveningPlayer.id == pid, EveningPlayer.evening_id == e.id).first()
            if p: p.team_id = t.id
    db.commit()
    return {"ok": True}


@router.delete("/{eid}/teams/{tid}")
def delete_team(eid: int, tid: int, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    t = db.query(Team).filter(Team.id == tid, Team.evening_id == e.id).first()
    if not t: raise HTTPException(404)
    db.query(EveningPlayer).filter(EveningPlayer.team_id == tid).update({"team_id": None})
    db.delete(t)
    db.commit()
    return {"ok": True}


# ── Club team templates → evening ──

@router.post("/{eid}/teams/from-templates")
def apply_club_team_templates(eid: int, shuffle: bool = False, db: Session = Depends(get_db),
                              user: User = Depends(require_club_member)):
    """Create all club team slots as evening teams. shuffle=true randomly distributes players."""
    import random
    e = get_club_evening(eid, user, db)
    templates = db.query(ClubTeam).filter(
        ClubTeam.club_id == user.club_id, ClubTeam.is_active == True
    ).order_by(ClubTeam.sort_order, ClubTeam.name).all()
    if not templates: raise HTTPException(400, "Keine Team-Vorlagen konfiguriert")

    # Remove all existing team assignments first
    db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).update({"team_id": None})
    # Delete existing teams
    for t in e.teams:
        db.delete(t)
    db.flush()

    # Create fresh teams from templates
    teams = []
    for tmpl in templates:
        t = Team(evening_id=e.id, name=tmpl.name)
        db.add(t)
        teams.append(t)
    db.flush()

    # Optionally randomly distribute all evening players across teams
    if shuffle:
        evening_players = list(e.players)
        random.shuffle(evening_players)
        for i, player in enumerate(evening_players):
            player.team_id = teams[i % len(teams)].id

    db.commit()
    db.refresh(e)
    return serialize_evening(e)


# ── Penalties ──

class PenaltyCreate(BaseModel):
    player_ids: Optional[List[int]] = None  # individual players
    team_id: Optional[int] = None  # OR entire team
    penalty_type_name: str
    icon: str = "⚠️"
    amount: float
    mode: str = "euro"
    unit_amount: Optional[float] = None  # default_amount at log time (count mode only)
    client_timestamp: float


@router.post("/{eid}/penalties")
def add_penalty(eid: int, data: PenaltyCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    target_players: List[int] = []
    if data.team_id:
        # Team penalty — applies to all team members
        team_players = db.query(EveningPlayer).filter(
            EveningPlayer.team_id == data.team_id, EveningPlayer.evening_id == e.id
        ).all()
        target_players = [p.id for p in team_players]
    else:
        target_players = data.player_ids or []
    created = []
    for pid in target_players:
        player = db.query(EveningPlayer).filter(EveningPlayer.id == pid).first()
        log = PenaltyLog(
            evening_id=e.id, player_id=pid, team_id=data.team_id,
            player_name=player.name if player else "?",
            penalty_type_name=data.penalty_type_name, icon=data.icon,
            amount=data.amount, mode=PenaltyMode(data.mode),
            unit_amount=data.unit_amount,
            client_timestamp=data.client_timestamp, created_by=user.id
        )
        db.add(log)
        created.append(log)
    db.commit()
    for log in created:
        if log.player_id:
            player = db.query(EveningPlayer).filter(EveningPlayer.id == log.player_id).first()
            if player and player.regular_member_id and data.mode == "euro":
                fee = f"{data.amount:.2f}".replace('.', ',')
                background_tasks.add_task(
                    push_to_regular_member,
                    db,
                    player.regular_member_id,
                    f"{data.icon} {data.penalty_type_name}",
                    f"{fee}€ — {e.date.strftime('%d.%m.%Y')}",
                    f"/#evening:penalties?penalty={log.id}&player={log.player_id}&playerName={log.player_name}",
                    category="penalties",
                )
    return [{"id": l.id, "player_name": l.player_name, "amount": l.amount} for l in created]


class PenaltyUpdate(BaseModel):
    player_id: Optional[int] = None
    penalty_type_name: Optional[str] = None
    icon: Optional[str] = None
    amount: Optional[float] = None
    mode: Optional[str] = None
    date: Optional[str] = None  # ISO date string for admin date override


@router.patch("/{eid}/penalties/{lid}")
def update_penalty(eid: int, lid: int, data: PenaltyUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    l = db.query(PenaltyLog).filter(PenaltyLog.id == lid, PenaltyLog.evening_id == e.id).first()
    if not l: raise HTTPException(404)
    updates = data.model_dump(exclude_none=True)
    # Date override requires admin role
    if "date" in updates:
        if user.role not in ("admin", "superadmin"):
            raise HTTPException(403, "Admin required to change penalty date")
        date_str = updates.pop("date")
        try:
            dt = _parse_date(date_str)
            l.client_timestamp = dt.timestamp() * 1000
        except Exception:
            raise HTTPException(400, "Invalid date format")
    for k, v in updates.items(): setattr(l, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/{eid}/penalties/{lid}")
def delete_penalty(eid: int,
                   lid: int,
                background_tasks: BackgroundTasks,
                   db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    l = db.query(PenaltyLog).filter(PenaltyLog.id == lid, PenaltyLog.evening_id == e.id).first()
    if not l: raise HTTPException(404)
    notify_member_id = None
    if not l.is_deleted:
        notify_member_id = l.regular_member_id
        if not notify_member_id and l.player_id:
            player = db.query(EveningPlayer).filter(EveningPlayer.id == l.player_id).first()
            if player:
                notify_member_id = player.regular_member_id
    l.is_deleted = True
    db.commit()
    if notify_member_id:
        icon = l.icon or "↩️"
        fee = f"{l.amount:.2f}".replace('.', ',')
        background_tasks.add_task(
            push_to_regular_member, db,
            notify_member_id, "↩️ Strafe storniert",
           f"{icon} {l.penalty_type_name}: {fee}€ wurde rückgängig gemacht.",
            "/#evening:penalties", category="penalties")
    return {"ok": True}


def _do_calculate_absence_penalties(
        e: Evening, background_tasks: BackgroundTasks, db: Session, created_by: int, notify: bool = True) -> dict:
    """Calculate absence penalties for an evening, RSVP-aware.

    Base fee = average penalty of present players (based on finished games).
    Extra fee (no_cancel_fee) applies to absent members who did NOT cancel
    (status is null or 'attending' — only explicit 'absent' RSVP waives the surcharge).
    notify: if False, skip sending push notifications (used for mid-evening recalculation).
    """
    # Delete existing absence entries to allow recalculation
    db.query(PenaltyLog).filter(
        PenaltyLog.evening_id == e.id,
        PenaltyLog.penalty_type_name == "Abwesenheit",
        PenaltyLog.player_id == None,
    ).delete()

    present_players = db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).all()
    present_regular_ids = {p.regular_member_id for p in present_players if p.regular_member_id}

    # Look up no_cancel_fee from club settings
    settings = db.query(ClubSettings).filter(ClubSettings.club_id == e.club_id).first()
    no_cancel_fee: float = ((settings.extra or {}).get("no_cancel_fee") or 0.0) if settings else 0.0

    # Base fee = average of present players' penalties
    if present_players:
        present_player_ids = [p.id for p in present_players]
        penalties = db.query(PenaltyLog).filter(
            PenaltyLog.evening_id == e.id,
            PenaltyLog.is_deleted == False,
            PenaltyLog.player_id.in_(present_player_ids),
        ).all()
        total = sum(
            pl.amount if pl.mode == PenaltyMode.euro
            else (pl.amount * pl.unit_amount if pl.unit_amount else 0)
            for pl in penalties
        )
        base_fee = total / len(present_players)
    else:
        base_fee = 0.0

    # Find ScheduledEvening for RSVP lookup — prefer direct FK, fall back to date match
    scheduled = None
    if e.scheduled_evening_id:
        scheduled = db.query(ScheduledEvening).filter(
            ScheduledEvening.id == e.scheduled_evening_id,
        ).first()
    else:
        scheduled = db.query(ScheduledEvening).filter(
            ScheduledEvening.club_id == e.club_id,
            cast(ScheduledEvening.scheduled_at, SQLDate) == cast(e.date, SQLDate),
        ).first()
    rsvp_map: dict[int, str] = {}
    if scheduled:
        for r in db.query(MemberRsvp).filter(MemberRsvp.scheduled_evening_id == scheduled.id).all():
            rsvp_map[r.regular_member_id] = r.status

    # Absent non-guest RegularMembers
    absent_members = db.query(RegularMember).filter(
        RegularMember.club_id == e.club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
        ~RegularMember.id.in_(present_regular_ids),
    ).all()

    now_ts = datetime.now(UTC).timestamp() * 1000
    for member in absent_members:
        # Either: properly cancelled (RSVP absent) → base_fee (average of present players)
        # Or: no cancellation → no_cancel_fee only (not additive); fall back to base_fee if unset
        # For ad-hoc evenings (no ScheduledEvening), always use base_fee — no_cancel_fee only
        # applies when RSVP was expected (i.e. there was a scheduled evening with RSVPs).
        rsvp_status = rsvp_map.get(member.id)
        if rsvp_status == RsvpStatus.absent:
            total_fee = base_fee
        elif scheduled and no_cancel_fee > 0:
            total_fee = no_cancel_fee
        else:
            total_fee = base_fee
        db.add(PenaltyLog(
            evening_id=e.id,
            player_id=None,
            team_id=None,
            regular_member_id=member.id,
            player_name=member.nickname or member.name,
            penalty_type_name="Abwesenheit",
            icon="🏠",
            amount=total_fee,
            mode=PenaltyMode.euro,
            unit_amount=None,
            client_timestamp=now_ts,
            created_by=created_by,
        ))

    db.commit()
    if notify:
        for member in absent_members:
            rsvp_status = rsvp_map.get(member.id)
            if rsvp_status == RsvpStatus.absent:
                total_fee = base_fee
            elif scheduled and no_cancel_fee > 0:
                total_fee = no_cancel_fee
            else:
                total_fee = base_fee
            fee_str = f"{total_fee:.2f}".replace('.', ',')
            background_tasks.add_task(
                push_to_regular_member,
                db, member.id, "🏠 Abwesenheitsstrafe",
               f"{fee_str}€ für {e.date.strftime('%d.%m.%Y')} — du warst nicht dabei.",
               "/#evening:penalties", category="penalties"
            )
    return {"avg": base_fee, "absent_count": len(absent_members)}


@router.post("/{eid}/absence-penalties")
def calculate_absence_penalties(eid: int,
background_tasks: BackgroundTasks,
                                db: Session = Depends(get_db),
                                user: User = Depends(require_club_admin)):
    """Admin: calculate absence penalties for all absent members. RSVP-aware."""
    e = get_club_evening(eid, user, db)
    return _do_calculate_absence_penalties(e, background_tasks, db, user.id)


class MarkCancelledBody(BaseModel):
    member_ids: List[int] = []


@router.post("/{eid}/mark-cancelled")
def mark_cancelled(eid: int, data: MarkCancelledBody, db: Session = Depends(get_db),
                   user: User = Depends(require_club_admin)):
    """Admin: mark members as having properly cancelled for an ad-hoc evening.

    Finds or creates a ScheduledEvening for the evening's date and club,
    then creates MemberRsvp entries with status='absent' for the given member IDs.
    This allows the absence-penalty calculation to distinguish cancellations from no-shows.
    """
    e = get_club_evening(eid, user, db)

    # Find or create a ScheduledEvening for this date/club
    scheduled = db.query(ScheduledEvening).filter(
        ScheduledEvening.club_id == e.club_id,
        cast(ScheduledEvening.scheduled_at, SQLDate) == cast(e.date, SQLDate),
    ).first()
    if not scheduled:
        scheduled = ScheduledEvening(
            club_id=e.club_id,
            scheduled_at=e.date,
            venue=e.venue,
            created_by=user.id,
        )
        db.add(scheduled)
        db.flush()

    for mid in data.member_ids:
        member = db.query(RegularMember).filter(
            RegularMember.id == mid, RegularMember.club_id == e.club_id,
        ).first()
        if not member:
            continue
        rsvp = db.query(MemberRsvp).filter(
            MemberRsvp.scheduled_evening_id == scheduled.id,
            MemberRsvp.regular_member_id == mid,
        ).first()
        if rsvp:
            rsvp.status = RsvpStatus.absent
        else:
            db.add(MemberRsvp(
                scheduled_evening_id=scheduled.id,
                regular_member_id=mid,
                status=RsvpStatus.absent,
            ))

    db.commit()
    return {"ok": True, "count": len(data.member_ids)}


# ── Games ──

class GameCreate(BaseModel):
    name: str
    template_id: Optional[int] = None
    is_opener: bool = False
    is_president_game: bool = False
    winner_type: str = "individual"
    turn_mode: Optional[str] = None  # 'alternating' | 'block'; only for team games
    loser_penalty: float = 0
    per_point_penalty: float = 0
    note: Optional[str] = None
    sort_order: int = 0
    client_timestamp: float


@router.post("/{eid}/games")
def add_game(eid: int, data: GameCreate, db: Session = Depends(get_db),
             user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    wt = data.winner_type if data.winner_type in ("team", "individual") else "individual"
    g = Game(
        evening_id=e.id,
        name=data.name,
        template_id=data.template_id,
        is_opener=data.is_opener,
        is_president_game=data.is_president_game,
        winner_type=WinnerType(wt),
        turn_mode=data.turn_mode if wt == "team" else None,
        loser_penalty=data.loser_penalty,
        per_point_penalty=data.per_point_penalty,
        note=data.note,
        sort_order=data.sort_order,
        status="open",
        client_timestamp=data.client_timestamp,
    )
    db.add(g)
    db.commit()
    return {"id": g.id, "name": g.name}


@router.post("/{eid}/games/{gid}/start")
def start_game(eid: int, gid: int, db: Session = Depends(get_db),
               user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id, Game.is_deleted == False).first()
    if not g: raise HTTPException(404)
    if g.status != "open":
        raise HTTPException(400, "Game is not in open state")
    g.status = "running"
    g.started_at = datetime.now(UTC)
    # Clear any stale camera throws from a previous run
    db.query(GameThrowLog).filter(GameThrowLog.game_id == gid).delete()
    db.commit()
    logger.info("Game started: id=%s name=%r evening_id=%s by user_id=%s", g.id, g.name, eid, user.id)
    return {"ok": True}


# ── Camera throw log ──

class CameraThrowCreate(BaseModel):
    throw_num: int
    pins: int
    cumulative: Optional[int] = None
    pin_states: list = []
    player_id: Optional[int] = None


@router.post("/{eid}/games/{gid}/throws")
def add_camera_throw(eid: int, gid: int, data: CameraThrowCreate,
                     background_tasks: BackgroundTasks,
                     db: Session = Depends(get_db),
                     user: User = Depends(require_club_admin)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id, Game.is_deleted == False).first()
    if not g:
        raise HTTPException(404, "Game not found")
    # Fall back to the game's active_player_id when no explicit player_id is sent (kiosk mode)
    effective_player_id = data.player_id if data.player_id is not None else g.active_player_id
    # Upsert — update if throw_num already exists, otherwise insert
    existing = db.query(GameThrowLog).filter(
        GameThrowLog.game_id == gid,
        GameThrowLog.throw_num == data.throw_num,
    ).first()
    if existing:
        existing.pins = data.pins
        existing.cumulative = data.cumulative
        existing.pin_states = data.pin_states
        if effective_player_id is not None:
            existing.player_id = effective_player_id
    else:
        db.add(GameThrowLog(
            game_id=gid,
            player_id=effective_player_id,
            throw_num=data.throw_num,
            pins=data.pins,
            cumulative=data.cumulative,
            pin_states=data.pin_states,
        ))
    db.commit()
    background_tasks.add_task(event_bus.publish, eid)
    return {"ok": True}


@router.delete("/{eid}/games/{gid}/throws")
def clear_camera_throws(eid: int, gid: int,
                        background_tasks: BackgroundTasks,
                        db: Session = Depends(get_db),
                        user: User = Depends(require_club_admin)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id).first()
    if not g:
        raise HTTPException(404, "Game not found")
    db.query(GameThrowLog).filter(GameThrowLog.game_id == gid).delete()
    db.commit()
    background_tasks.add_task(event_bus.publish, eid)
    return {"ok": True}


@router.delete("/{eid}/games/{gid}/throws/{tid}")
def delete_camera_throw(eid: int, gid: int, tid: int,
                        background_tasks: BackgroundTasks,
                        db: Session = Depends(get_db),
                        user: User = Depends(require_club_admin)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id).first()
    if not g:
        raise HTTPException(404, "Game not found")
    throw = db.query(GameThrowLog).filter(GameThrowLog.id == tid, GameThrowLog.game_id == gid).first()
    if not throw:
        raise HTTPException(404, "Throw not found")
    db.delete(throw)
    db.commit()
    background_tasks.add_task(event_bus.publish, eid)
    return {"ok": True}


class CameraThrowUpdate(BaseModel):
    pins: int
    cumulative: Optional[int] = None
    pin_states: Optional[list] = None


@router.patch("/{eid}/games/{gid}/throws/{tid}")
def update_camera_throw(eid: int, gid: int, tid: int, data: CameraThrowUpdate,
                        background_tasks: BackgroundTasks,
                        db: Session = Depends(get_db),
                        user: User = Depends(require_club_admin)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id).first()
    if not g:
        raise HTTPException(404, "Game not found")
    throw = db.query(GameThrowLog).filter(GameThrowLog.id == tid, GameThrowLog.game_id == gid).first()
    if not throw:
        raise HTTPException(404, "Throw not found")
    throw.pins = data.pins
    throw.cumulative = data.cumulative
    if data.pin_states is not None:
        throw.pin_states = data.pin_states
    db.commit()
    background_tasks.add_task(event_bus.publish, eid)
    return {"ok": True}


class ActivePlayerUpdate(BaseModel):
    player_id: Optional[int] = None  # None clears the active player


@router.patch("/{eid}/games/{gid}/active-player")
def set_active_player(eid: int, gid: int, data: ActivePlayerUpdate,
                      background_tasks: BackgroundTasks,
                      db: Session = Depends(get_db),
                      user: User = Depends(require_club_member)):
    """Set the currently-throwing player for a game so the kiosk can auto-assign throws."""
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id).first()
    if not g:
        raise HTTPException(404, "Game not found")
    g.active_player_id = data.player_id
    db.commit()
    background_tasks.add_task(event_bus.publish, eid)
    return {"ok": True}


class GameFinish(BaseModel):
    winner_ref: str   # "p:{player_id}" or "t:{team_id}"
    winner_name: str
    scores: dict = {}
    loser_penalty: Optional[float] = None  # override game default


def _apply_game_penalties(e: Evening, g: Game, winner_ref: str, db: Session, user: User,
                          background_tasks: BackgroundTasks = None):
    """Delete existing auto-penalties for this game, then recreate."""
    db.query(PenaltyLog).filter(
        PenaltyLog.game_id == g.id,
        PenaltyLog.is_deleted == False,
    ).update({"is_deleted": True})
    db.flush()
    base_penalty = g.loser_penalty
    per_point = g.per_point_penalty or 0
    if base_penalty <= 0 and per_point <= 0:
        return
    scores = g.scores or {}
    winner_score = scores.get(winner_ref, 0) or 0
    is_team_game = winner_ref.startswith("t:")
    losers = [p for p in e.players if
              ("p:" + str(p.id) != winner_ref) and
              (not p.team_id or "t:" + str(p.team_id) != winner_ref)]
    now_ts = datetime.now(UTC).timestamp() * 1000
    for p in losers:
        if is_team_game and p.team_id:
            loser_ref = f"t:{p.team_id}"
        else:
            loser_ref = f"p:{p.id}"
        loser_score = scores.get(loser_ref, 0) or 0
        diff = abs(winner_score - loser_score)
        total_penalty = base_penalty + diff * per_point
        if total_penalty <= 0:
            continue
        db.add(PenaltyLog(
            evening_id=e.id, player_id=p.id, player_name=p.name,
            penalty_type_name="Spielstrafe", icon="🏆",
            amount=total_penalty, mode=PenaltyMode.euro,
            game_id=g.id,
            client_timestamp=now_ts, created_by=user.id,
        ))
        if p.regular_member_id:
            fee = f"{total_penalty:.2f}".replace('.', ',')
            if background_tasks:
                background_tasks.add_task(
                    push_to_regular_member, db, p.regular_member_id, f"🏆 Spielstrafe: {g.name}",
                    f"{fee}€ — {e.date.strftime('%d.%m.%Y')}", "/#evening:penalties", "penalties")
            else:
                push_to_regular_member(db, p.regular_member_id, f"🏆 Spielstrafe: {g.name}",
                                       f"{fee}€ — {e.date.strftime('%d.%m.%Y')}", "/#evening:penalties",
                                       category="penalties")


@router.post("/{eid}/games/{gid}/finish")
def finish_game(eid: int, gid: int, data: GameFinish, background_tasks: BackgroundTasks,
                db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    e_date_str = format_datetime(e.date, locale=user.preferred_locale or "de")
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id, Game.is_deleted == False).first()
    if not g: raise HTTPException(404)
    g.winner_ref = data.winner_ref
    g.winner_name = data.winner_name
    g.scores = data.scores
    if data.loser_penalty is not None:
        g.loser_penalty = data.loser_penalty
    if g.status != "finished":
        g.status = "finished"
        g.finished_at = datetime.now(UTC)
    _apply_game_penalties(e, g, data.winner_ref, db, user, background_tasks)
    # King: opener game with individual winner → set king flag
    if g.is_opener and data.winner_ref.startswith("p:"):
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).update({"is_king": False})
        db.flush()
        try:
            winner_pid = int(data.winner_ref[2:])
            winner_player = db.query(EveningPlayer).filter(EveningPlayer.id == winner_pid).first()
            if winner_player:
                winner_player.is_king = True
                if winner_player.regular_member_id:
                    background_tasks.add_task(
                        push_to_regular_member, db, winner_player.regular_member_id, "👑 Du bist König!",
                        f"Du hast das Eröffnungsspiel am {e_date_str} gewonnen.",
                        "/#evening:games", "games")
        except (ValueError, IndexError):
            pass
    db.commit()
    logger.info("Game finished: id=%s name=%r winner=%r evening_id=%s by user_id=%s", g.id, g.name, data.winner_ref, eid, user.id)
    # Auto-recalculate absence penalties after each game finish (silent, no push)
    if e.players:
        _do_calculate_absence_penalties(e, background_tasks, db, user.id, notify=False)
    return {"ok": True}


class GameUpdate(BaseModel):
    name: Optional[str] = None
    is_opener: Optional[bool] = None
    is_president_game: Optional[bool] = None
    winner_type: Optional[str] = None
    turn_mode: Optional[str] = None
    loser_penalty: Optional[float] = None
    per_point_penalty: Optional[float] = None
    note: Optional[str] = None


@router.patch("/{eid}/games/{gid}")
def update_game(eid: int, gid: int, data: GameUpdate, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id).first()
    if not g: raise HTTPException(404)
    changed = data.model_dump(exclude_none=True)
    penalty_changed = "loser_penalty" in changed or "per_point_penalty" in changed
    for k, v in changed.items():
        setattr(g, k, v)
    # Re-apply loser penalties if game is finished and penalty amount changed
    if g.status == "finished" and penalty_changed and g.winner_ref:
        _apply_game_penalties(e, g, g.winner_ref, db, user)
    db.commit()
    return {"ok": True}


@router.delete("/{eid}/games/{gid}")
def delete_game(eid: int, gid: int, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id).first()
    if not g: raise HTTPException(404)
    # Soft-delete auto-penalties too
    db.query(PenaltyLog).filter(PenaltyLog.game_id == gid).update({"is_deleted": True})
    g.is_deleted = True
    db.commit()
    return {"ok": True}


# ── Drinks ──

class DrinkCreate(BaseModel):
    drink_type: str  # "beer" | "shots"
    variety: Optional[str] = None
    participant_ids: List[int]
    client_timestamp: float


@router.post("/{eid}/drinks")
def add_drink_round(eid: int, data: DrinkCreate, db: Session = Depends(get_db),
                    user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    r = DrinkRound(evening_id=e.id, drink_type=DrinkType(data.drink_type),
                   variety=data.variety, participant_ids=data.participant_ids,
                   client_timestamp=data.client_timestamp)
    db.add(r)
    db.commit()
    return {"id": r.id, "drink_type": r.drink_type}


class DrinkUpdate(BaseModel):
    variety: Optional[str] = None
    participant_ids: Optional[List[int]] = None


@router.patch("/{eid}/drinks/{rid}")
def update_drink_round(eid: int, rid: int, data: DrinkUpdate, db: Session = Depends(get_db),
                       user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    r = db.query(DrinkRound).filter(DrinkRound.id == rid, DrinkRound.evening_id == e.id).first()
    if not r: raise HTTPException(404)
    for k, v in data.model_dump(exclude_none=True).items(): setattr(r, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/{eid}/drinks/{rid}")
def delete_drink_round(eid: int, rid: int, db: Session = Depends(get_db),
                       user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    r = db.query(DrinkRound).filter(DrinkRound.id == rid, DrinkRound.evening_id == e.id).first()
    if not r: raise HTTPException(404)
    r.is_deleted = True
    db.commit()
    return {"ok": True}


# ── Highlights ──

class HighlightCreate(BaseModel):
    text: Optional[str] = None
    media_url: Optional[str] = None


@router.post("/{eid}/highlights")
def add_highlight(eid: int, data: HighlightCreate, db: Session = Depends(get_db),
                  user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    if e.is_closed:
        raise HTTPException(400, "Evening is closed")
    text = data.text.strip() if data.text else None
    media_url = data.media_url or None
    if not text and not media_url:
        raise HTTPException(400, "Text or media is required")
    h = EveningHighlight(evening_id=eid, text=text, media_url=media_url, created_by=user.id)
    db.add(h)
    db.commit()
    db.refresh(h)
    return {"id": h.id, "text": h.text, "media_url": h.media_url,
            "created_at": h.created_at.isoformat() if h.created_at else None}


@router.delete("/{eid}/highlights/{hid}", status_code=204)
def delete_highlight(eid: int, hid: int, db: Session = Depends(get_db),
                     user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    h = db.query(EveningHighlight).filter(EveningHighlight.id == hid, EveningHighlight.evening_id == e.id).first()
    if not h:
        raise HTTPException(404, "Highlight not found")
    db.delete(h)
    db.commit()


@router.get("/{eid}/events")
async def stream_evening_events(
        eid: int,
        token: str = Query(...),
):
    """SSE stream — pushes 'updated' whenever the evening changes.

    The DB session is opened, used for auth, then explicitly closed before
    entering the infinite streaming loop.  This prevents holding a pool
    connection for the entire lifetime of the SSE connection (which would
    exhaust the QueuePool when many clients are connected simultaneously).
    """
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    # Auth check: open a session, validate, then close it immediately so the
    # pool slot is returned before we start the potentially long-lived stream.
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user or not user.is_active or not user.club_id:
            raise HTTPException(status_code=401, detail="Unauthorized")
        e = (await db.execute(select(Evening).where(Evening.id == eid, Evening.club_id == user.club_id))).scalar_one_or_none()
        if not e:
            raise HTTPException(status_code=404, detail="Evening not found")
    # DB session is now closed; pool slot has been returned.

    async def event_stream():
        q = event_bus.subscribe(eid)
        try:
            yield "data: connected\n\n"
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=25)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            event_bus.unsubscribe(eid, q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

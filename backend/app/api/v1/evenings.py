"""Evening management — CRUD for evenings, players, teams, penalties, games, drinks."""
from datetime import datetime, UTC
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member, require_club_admin
from core.database import get_db
from models.drink import DrinkRound, DrinkType
from models.evening import Evening, EveningPlayer, Team, ClubTeam, RegularMember
from models.game import Game, GameStatus, WinnerType
from models.penalty import PenaltyLog, PenaltyMode
from models.user import User

router = APIRouter(prefix="/evening", tags=["evening"])


# ── Helpers ──

def get_club_evening(evening_id: int, user: User, db: Session) -> Evening:
    e = db.query(Evening).filter(Evening.id == evening_id, Evening.club_id == user.club_id).first()
    if not e: raise HTTPException(404, "Evening not found")
    return e


def serialize_evening(e: Evening) -> dict:
    return {
        "id": e.id, "date": e.date, "venue": e.venue, "note": e.note,
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
                   "winner_type": g.winner_type, "winner_ref": g.winner_ref,
                   "winner_name": g.winner_name, "scores": g.scores,
                   "loser_penalty": g.loser_penalty, "per_point_penalty": g.per_point_penalty, "note": g.note,
                   "sort_order": g.sort_order, "template_id": g.template_id,
                   "status": g.status,
                   "started_at": g.started_at.isoformat() if g.started_at else None,
                   "finished_at": g.finished_at.isoformat() if g.finished_at else None,
                   "client_timestamp": g.client_timestamp}
                  for g in e.games if not g.is_deleted],
        "drink_rounds": [{"id": r.id, "drink_type": r.drink_type, "variety": r.variety,
                          "participant_ids": r.participant_ids,
                          "client_timestamp": r.client_timestamp}
                         for r in e.drink_rounds if not r.is_deleted],
    }


# ── Evening CRUD ──

@router.get("/")
def list_evenings(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    items = db.query(Evening).filter(Evening.club_id == user.club_id).order_by(Evening.date.desc()).all()
    return [{"id": e.id, "date": e.date, "venue": e.venue, "is_closed": e.is_closed,
             "player_count": len(e.players)} for e in items]


class EveningCreate(BaseModel):
    date: str
    venue: Optional[str] = None
    note: Optional[str] = None


@router.post("/")
def create_evening(data: EveningCreate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = Evening(club_id=user.club_id, created_by=user.id, **data.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
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
def update_evening(eid: int, data: EveningUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    for k, v in data.model_dump(exclude_none=True).items(): setattr(e, k, v)
    db.commit()
    db.refresh(e)
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
def add_penalty(eid: int, data: PenaltyCreate, db: Session = Depends(get_db),
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
    return [{"id": l.id, "player_name": l.player_name, "amount": l.amount} for l in created]


class PenaltyUpdate(BaseModel):
    player_id: Optional[int] = None
    penalty_type_name: Optional[str] = None
    icon: Optional[str] = None
    amount: Optional[float] = None
    mode: Optional[str] = None


@router.patch("/{eid}/penalties/{lid}")
def update_penalty(eid: int, lid: int, data: PenaltyUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    l = db.query(PenaltyLog).filter(PenaltyLog.id == lid, PenaltyLog.evening_id == e.id).first()
    if not l: raise HTTPException(404)
    for k, v in data.model_dump(exclude_none=True).items(): setattr(l, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/{eid}/penalties/{lid}")
def delete_penalty(eid: int, lid: int, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    l = db.query(PenaltyLog).filter(PenaltyLog.id == lid, PenaltyLog.evening_id == e.id).first()
    if not l: raise HTTPException(404)
    l.is_deleted = True
    db.commit()
    return {"ok": True}


@router.post("/{eid}/absence-penalties")
def calculate_absence_penalties(eid: int, db: Session = Depends(get_db),
                                user: User = Depends(require_club_admin)):
    """Admin: calculate average penalty of present players and create entries for absent members."""
    e = get_club_evening(eid, user, db)

    # Delete existing absence entries to allow recalculation
    db.query(PenaltyLog).filter(
        PenaltyLog.evening_id == e.id,
        PenaltyLog.penalty_type_name == "Abwesenheit",
        PenaltyLog.player_id == None,
    ).delete()

    present_players = db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).all()
    if not present_players:
        raise HTTPException(400, "No players present at this evening")

    present_regular_ids = {p.regular_member_id for p in present_players if p.regular_member_id}
    present_player_ids = [p.id for p in present_players]

    # Sum all penalty contributions for present players (full uncapped amounts)
    penalties = db.query(PenaltyLog).filter(
        PenaltyLog.evening_id == e.id,
        PenaltyLog.is_deleted == False,
        PenaltyLog.player_id.in_(present_player_ids),
    ).all()

    total = 0.0
    for pl in penalties:
        if pl.mode == PenaltyMode.euro:
            total += pl.amount
        elif pl.unit_amount is not None:
            total += pl.amount * pl.unit_amount

    avg = total / len(present_players)

    # Absent non-guest RegularMembers
    absent_members = db.query(RegularMember).filter(
        RegularMember.club_id == e.club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
        ~RegularMember.id.in_(present_regular_ids),
    ).all()

    now_ts = datetime.now(UTC).timestamp() * 1000
    for member in absent_members:
        db.add(PenaltyLog(
            evening_id=e.id,
            player_id=None,
            team_id=None,
            regular_member_id=member.id,
            player_name=member.name,
            penalty_type_name="Abwesenheit",
            icon="🏠",
            amount=avg,
            mode=PenaltyMode.euro,
            unit_amount=None,
            client_timestamp=now_ts,
            created_by=user.id,
        ))

    db.commit()
    return {"avg": avg, "absent_count": len(absent_members)}


# ── Games ──

class GameCreate(BaseModel):
    name: str
    template_id: Optional[int] = None
    is_opener: bool = False
    winner_type: str = "either"
    loser_penalty: float = 0
    per_point_penalty: float = 0
    note: Optional[str] = None
    sort_order: int = 0
    client_timestamp: float


@router.post("/{eid}/games")
def add_game(eid: int, data: GameCreate, db: Session = Depends(get_db),
             user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    g = Game(
        evening_id=e.id,
        name=data.name,
        template_id=data.template_id,
        is_opener=data.is_opener,
        winner_type=WinnerType(data.winner_type),
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
    db.commit()
    return {"ok": True}


class GameFinish(BaseModel):
    winner_ref: str   # "p:{player_id}" or "t:{team_id}"
    winner_name: str
    scores: dict = {}
    loser_penalty: Optional[float] = None  # override game default


def _apply_game_penalties(e: Evening, g: Game, winner_ref: str, db: Session, user: User):
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


@router.post("/{eid}/games/{gid}/finish")
def finish_game(eid: int, gid: int, data: GameFinish, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
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
    _apply_game_penalties(e, g, data.winner_ref, db, user)
    # King: opener game with individual winner → set king flag
    if g.is_opener and data.winner_ref.startswith("p:"):
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).update({"is_king": False})
        db.flush()
        try:
            winner_pid = int(data.winner_ref[2:])
            winner_player = db.query(EveningPlayer).filter(EveningPlayer.id == winner_pid).first()
            if winner_player:
                winner_player.is_king = True
        except (ValueError, IndexError):
            pass
    db.commit()
    return {"ok": True}


class GameUpdate(BaseModel):
    name: Optional[str] = None
    is_opener: Optional[bool] = None
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

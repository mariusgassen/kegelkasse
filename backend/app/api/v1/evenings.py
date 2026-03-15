"""Evening management — CRUD for evenings, players, teams, penalties, games, drinks."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import time

from app.core.database import get_db
from app.models.user import User
from app.models.evening import Evening, EveningPlayer, Team
from app.models.penalty import PenaltyLog, PenaltyMode
from app.models.game import Game, WinnerType
from app.models.drink import DrinkRound, DrinkType
from app.api.deps import require_club_member

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
                     "team_id": p.team_id} for p in e.players],
        "teams": [{"id": t.id, "name": t.name} for t in e.teams],
        "penalty_log": [{"id": l.id, "player_id": l.player_id, "team_id": l.team_id,
                          "player_name": l.player_name, "penalty_type_name": l.penalty_type_name,
                          "icon": l.icon, "amount": l.amount, "mode": l.mode,
                          "client_timestamp": l.client_timestamp}
                         for l in e.penalty_log if not l.is_deleted],
        "games": [{"id": g.id, "name": g.name, "is_opener": g.is_opener,
                   "winner_type": g.winner_type, "winner_ref": g.winner_ref,
                   "winner_name": g.winner_name, "scores": g.scores,
                   "loser_penalty": g.loser_penalty, "note": g.note,
                   "sort_order": g.sort_order, "template_id": g.template_id,
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
    db.add(e); db.commit(); db.refresh(e)
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
    db.commit(); db.refresh(e)
    return serialize_evening(e)

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
    db.add(p); db.commit()
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
    db.commit(); return {"ok": True}

@router.delete("/{eid}/players/{pid}")
def remove_player(eid: int, pid: int, db: Session = Depends(get_db),
                  user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    p = db.query(EveningPlayer).filter(EveningPlayer.id == pid, EveningPlayer.evening_id == e.id).first()
    if not p: raise HTTPException(404)
    db.delete(p); db.commit()
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
    db.add(t); db.flush()
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
    db.commit(); return {"ok": True}

@router.delete("/{eid}/teams/{tid}")
def delete_team(eid: int, tid: int, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    t = db.query(Team).filter(Team.id == tid, Team.evening_id == e.id).first()
    if not t: raise HTTPException(404)
    db.query(EveningPlayer).filter(EveningPlayer.team_id == tid).update({"team_id": None})
    db.delete(t); db.commit()
    return {"ok": True}

# ── Penalties ──

class PenaltyCreate(BaseModel):
    player_ids: Optional[List[int]] = None   # individual players
    team_id: Optional[int] = None            # OR entire team
    penalty_type_name: str
    icon: str = "⚠️"
    amount: float
    mode: str = "euro"
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
            client_timestamp=data.client_timestamp, created_by=user.id
        )
        db.add(log); created.append(log)
    db.commit()
    return [{"id": l.id, "player_name": l.player_name, "amount": l.amount} for l in created]

class PenaltyUpdate(BaseModel):
    player_id: Optional[int] = None
    penalty_type_name: Optional[str] = None
    amount: Optional[float] = None
    mode: Optional[str] = None

@router.patch("/{eid}/penalties/{lid}")
def update_penalty(eid: int, lid: int, data: PenaltyUpdate, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    l = db.query(PenaltyLog).filter(PenaltyLog.id == lid, PenaltyLog.evening_id == e.id).first()
    if not l: raise HTTPException(404)
    for k, v in data.model_dump(exclude_none=True).items(): setattr(l, k, v)
    db.commit(); return {"ok": True}

@router.delete("/{eid}/penalties/{lid}")
def delete_penalty(eid: int, lid: int, db: Session = Depends(get_db),
                   user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    l = db.query(PenaltyLog).filter(PenaltyLog.id == lid, PenaltyLog.evening_id == e.id).first()
    if not l: raise HTTPException(404)
    l.is_deleted = True; db.commit()
    return {"ok": True}

# ── Games ──

class GameCreate(BaseModel):
    name: str
    template_id: Optional[int] = None
    is_opener: bool = False
    winner_type: str = "either"
    winner_ref: Optional[str] = None
    winner_name: Optional[str] = None
    scores: dict = {}
    loser_penalty: float = 0
    note: Optional[str] = None
    sort_order: int = 0
    client_timestamp: float

@router.post("/{eid}/games")
def add_game(eid: int, data: GameCreate, db: Session = Depends(get_db),
             user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    g = Game(evening_id=e.id, winner_type=WinnerType(data.winner_type), **{
        k: v for k, v in data.model_dump().items() if k != "winner_type"
    })
    db.add(g); db.flush()
    # Auto-apply loser penalties
    if data.loser_penalty > 0:
        losers = [p for p in e.players if
                  ("p:"+str(p.id) != data.winner_ref) and
                  (not p.team_id or "t:"+str(p.team_id) != data.winner_ref)]
        for p in losers:
            log = PenaltyLog(
                evening_id=e.id, player_id=p.id, player_name=p.name,
                penalty_type_name=f"Loser: {data.name}", icon="🏆",
                amount=data.loser_penalty, mode=PenaltyMode.euro,
                client_timestamp=data.client_timestamp, created_by=user.id
            )
            db.add(log)
    db.commit()
    return {"id": g.id, "name": g.name}

class GameUpdate(BaseModel):
    name: Optional[str] = None
    is_opener: Optional[bool] = None
    winner_ref: Optional[str] = None
    winner_name: Optional[str] = None
    scores: Optional[dict] = None
    loser_penalty: Optional[float] = None
    note: Optional[str] = None

@router.patch("/{eid}/games/{gid}")
def update_game(eid: int, gid: int, data: GameUpdate, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id).first()
    if not g: raise HTTPException(404)
    for k, v in data.model_dump(exclude_none=True).items(): setattr(g, k, v)
    db.commit(); return {"ok": True}

@router.delete("/{eid}/games/{gid}")
def delete_game(eid: int, gid: int, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    g = db.query(Game).filter(Game.id == gid, Game.evening_id == e.id).first()
    if not g: raise HTTPException(404)
    g.is_deleted = True; db.commit()
    return {"ok": True}

# ── Drinks ──

class DrinkCreate(BaseModel):
    drink_type: str   # "beer" | "shots"
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
    db.add(r); db.commit()
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
    db.commit(); return {"ok": True}

@router.delete("/{eid}/drinks/{rid}")
def delete_drink_round(eid: int, rid: int, db: Session = Depends(get_db),
                       user: User = Depends(require_club_member)):
    e = get_club_evening(eid, user, db)
    r = db.query(DrinkRound).filter(DrinkRound.id == rid, DrinkRound.evening_id == e.id).first()
    if not r: raise HTTPException(404)
    r.is_deleted = True; db.commit()
    return {"ok": True}

"""Offline sync endpoint — applies queued client operations in timestamp order."""
import time
from typing import List, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from models.drink import DrinkRound, DrinkType
from models.evening import Evening, EveningPlayer
from models.penalty import PenaltyLog, PenaltyMode
from models.user import User

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncChange(BaseModel):
    type: str  # e.g. "add_penalty", "delete_penalty", "add_drink", "delete_drink"
    timestamp: float  # client timestamp — changes applied in order
    data: Any


class SyncPayload(BaseModel):
    client_id: str
    last_sync: Optional[float] = None
    changes: List[SyncChange] = []


def _get_evening(evening_id: int, club_id: int, db: Session) -> Evening:
    e = db.query(Evening).filter(Evening.id == evening_id, Evening.club_id == club_id).first()
    if not e:
        raise HTTPException(404, "Evening not found")
    return e


def _apply_add_penalty(data: Any, user: User, db: Session) -> None:
    evening_id = int(data.get("evening_id"))
    e = _get_evening(evening_id, user.club_id, db)
    player_ids: List[int] = data.get("player_ids") or []
    team_id: Optional[int] = data.get("team_id")
    if team_id:
        from models.evening import Team  # noqa: F401
        team_players = db.query(EveningPlayer).filter(
            EveningPlayer.team_id == team_id, EveningPlayer.evening_id == e.id
        ).all()
        player_ids = [p.id for p in team_players]
    for pid in player_ids:
        player = db.query(EveningPlayer).filter(EveningPlayer.id == pid).first()
        log = PenaltyLog(
            evening_id=e.id, player_id=pid, team_id=team_id,
            player_name=player.name if player else "?",
            penalty_type_name=data.get("penalty_type_name", ""),
            icon=data.get("icon", "⚠️"),
            amount=float(data.get("amount", 0)),
            mode=PenaltyMode(data.get("mode", "euro")),
            unit_amount=data.get("unit_amount"),
            client_timestamp=float(data.get("client_timestamp", time.time())),
            created_by=user.id,
        )
        db.add(log)


def _apply_delete_penalty(data: Any, user: User, db: Session) -> None:
    evening_id = int(data.get("evening_id"))
    penalty_id = int(data.get("penalty_id"))
    e = _get_evening(evening_id, user.club_id, db)
    log = db.query(PenaltyLog).filter(
        PenaltyLog.id == penalty_id, PenaltyLog.evening_id == e.id
    ).first()
    if log:
        log.is_deleted = True


def _apply_add_drink(data: Any, user: User, db: Session) -> None:
    evening_id = int(data.get("evening_id"))
    e = _get_evening(evening_id, user.club_id, db)
    r = DrinkRound(
        evening_id=e.id,
        drink_type=DrinkType(data.get("drink_type", "beer")),
        variety=data.get("variety"),
        participant_ids=data.get("participant_ids", []),
        client_timestamp=float(data.get("client_timestamp", time.time())),
    )
    db.add(r)


def _apply_delete_drink(data: Any, user: User, db: Session) -> None:
    evening_id = int(data.get("evening_id"))
    drink_id = int(data.get("drink_id"))
    e = _get_evening(evening_id, user.club_id, db)
    r = db.query(DrinkRound).filter(
        DrinkRound.id == drink_id, DrinkRound.evening_id == e.id
    ).first()
    if r:
        db.delete(r)


_HANDLERS = {
    "add_penalty": _apply_add_penalty,
    "delete_penalty": _apply_delete_penalty,
    "add_drink": _apply_add_drink,
    "delete_drink": _apply_delete_drink,
}


@router.post("/")
def sync(payload: SyncPayload, db: Session = Depends(get_db),
         user: User = Depends(require_club_member)):
    """
    Offline sync — applies pending client changes in chronological order.
    Append-only operations (penalties, drinks) are safe to replay.
    Returns current server timestamp so the client can track sync state.
    """
    applied = 0
    errors = []

    for change in sorted(payload.changes, key=lambda c: c.timestamp):
        handler = _HANDLERS.get(change.type)
        if handler is None:
            errors.append({"change_type": change.type, "error": "unknown change type"})
            continue
        try:
            handler(change.data, user, db)
            applied += 1
        except Exception as e:
            errors.append({"change_type": change.type, "error": str(e)})

    db.commit()
    return {"applied": applied, "errors": errors, "server_timestamp": time.time()}

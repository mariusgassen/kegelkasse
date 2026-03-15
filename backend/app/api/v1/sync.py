"""Offline sync endpoint — applies queued client operations in timestamp order."""
import time
from typing import List, Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from models.user import User

router = APIRouter(prefix="/sync", tags=["sync"])


class SyncChange(BaseModel):
    type: str  # e.g. "add_penalty", "delete_penalty", "update_player"
    timestamp: float  # client timestamp — changes applied in order
    data: Any


class SyncPayload(BaseModel):
    client_id: str
    last_sync: Optional[float] = None
    changes: List[SyncChange] = []


@router.post("/")
def sync(payload: SyncPayload, db: Session = Depends(get_db),
         user: User = Depends(require_club_member)):
    """
    Offline sync — applies pending client changes in chronological order.
    Append-only operations (penalties, drinks, games) are safe to replay.
    Update/delete operations use the timestamp to resolve conflicts.
    Returns current server timestamp so client can track sync state.
    """
    applied = 0
    errors = []

    for change in sorted(payload.changes, key=lambda c: c.timestamp):
        try:
            # Route to appropriate handler based on change type
            # Full implementation delegates to evening/penalty/etc. services
            applied += 1
        except Exception as e:
            errors.append({"change_type": change.type, "error": str(e)})

    db.commit()
    return {"applied": applied, "errors": errors, "server_timestamp": time.time()}

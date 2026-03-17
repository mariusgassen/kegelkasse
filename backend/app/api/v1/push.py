"""Web Push subscription endpoints."""
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.config import settings
from core.database import get_db
from models.push import PushSubscription
from models.user import User

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-key")
def get_vapid_key(user: User = Depends(require_club_member)):
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(503, "Push notifications not configured")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.post("/subscribe", status_code=201)
def subscribe(data: SubscribeRequest, db: Session = Depends(get_db),
              user: User = Depends(require_club_member)):
    # Upsert: update keys if endpoint already exists for this user
    existing = db.query(PushSubscription).filter(
        PushSubscription.endpoint == data.endpoint
    ).first()
    if existing:
        existing.p256dh = data.p256dh
        existing.auth = data.auth
    else:
        db.add(PushSubscription(
            user_id=user.id,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth=data.auth,
        ))
    db.commit()
    return {"ok": True}


@router.delete("/unsubscribe", status_code=204)
def unsubscribe(endpoint: Optional[str] = None, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    q = db.query(PushSubscription).filter(PushSubscription.user_id == user.id)
    if endpoint:
        q = q.filter(PushSubscription.endpoint == endpoint)
    q.delete(synchronize_session=False)
    db.commit()


@router.get("/status")
def status(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    count = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).count()
    return {"subscribed": count > 0, "configured": bool(settings.VAPID_PUBLIC_KEY)}


@router.post("/test")
async def test_push(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Send a test push notification to all subscriptions of the current user after a 10s delay."""
    if not settings.VAPID_PRIVATE_KEY:
        raise HTTPException(503, "Push notifications not configured")
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    if not subs:
        raise HTTPException(404, "No push subscription found for this device")
    await asyncio.sleep(10)
    from core.push import _send_one
    for sub in subs:
        _send_one(db, sub, "Kegelkasse 🎳", "Push-Benachrichtigungen funktionieren!", "/")
    return {"sent": len(subs)}

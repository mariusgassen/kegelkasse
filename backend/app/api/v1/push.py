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

_DEFAULT_PREFS = {
    "penalties": True,
    "evenings": True,
    "schedule": True,
    "payments": True,
    "games": True,
    "members": True,
}

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
    """Send a test push notification to all subscriptions of the current user (3s delay)."""
    if not settings.VAPID_PRIVATE_KEY:
        raise HTTPException(503, "Push notifications not configured")
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    if not subs:
        raise HTTPException(404, "No push subscription found for this device")
    await asyncio.sleep(3)
    from core.push import _send_one_raising
    errors: list[str] = []
    sent = 0
    for sub in subs:
        try:
            _send_one_raising(db, sub, "Kegelkasse 🎳", "Push-Benachrichtigungen funktionieren!", "/")
            sent += 1
        except Exception as exc:
            errors.append(str(exc))
    if errors and sent == 0:
        raise HTTPException(500, f"Push fehlgeschlagen: {errors[0]}")
    return {"sent": sent, "errors": errors}


@router.get("/preferences")
def get_push_preferences(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Return notification category preferences for the current user."""
    prefs = dict(_DEFAULT_PREFS)
    prefs.update(user.push_preferences or {})
    return prefs


class PushPreferencesUpdate(BaseModel):
    penalties: Optional[bool] = None
    evenings: Optional[bool] = None
    schedule: Optional[bool] = None
    payments: Optional[bool] = None
    games: Optional[bool] = None
    members: Optional[bool] = None


@router.patch("/preferences")
def update_push_preferences(data: PushPreferencesUpdate, db: Session = Depends(get_db),
                             user: User = Depends(require_club_member)):
    """Update notification category preferences (partial — only provided keys are updated)."""
    prefs = dict(user.push_preferences or {})
    payload = data.model_dump(exclude_none=True)
    prefs.update(payload)
    user.push_preferences = prefs
    db.commit()
    result = dict(_DEFAULT_PREFS)
    result.update(prefs)
    return result


@router.get("/debug")
def debug_push(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Return sanitised subscription info + VAPID config state for debugging."""
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    return {
        "vapid_configured": bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY),
        "vapid_claim_email": settings.VAPID_CLAIM_EMAIL or None,
        "subscription_count": len(subs),
        "subscriptions": [
            {
                "id": s.id,
                "endpoint_prefix": s.endpoint[:60] if s.endpoint else None,
                "p256dh_len": len(s.p256dh) if s.p256dh else 0,
                "auth_len": len(s.auth) if s.auth else 0,
            }
            for s in subs
        ],
    }

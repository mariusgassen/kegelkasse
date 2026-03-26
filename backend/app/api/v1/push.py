"""Web Push subscription endpoints."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_admin, require_club_member
from core.config import settings
from core.database import get_db
from models.push import NotificationLog, PushSubscription
from models.user import User

_DEFAULT_PREFS = {
    "penalties": True,
    "evenings": True,
    "schedule": True,
    "payments": True,
    "games": True,
    "members": True,
    "reminder_debt": True,
    "reminder_schedule": True,
    "reminder_payments": True,
}

logger = logging.getLogger(__name__)

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
        logger.info("Push subscription updated: user=%d endpoint_prefix=%s", user.id, data.endpoint[:40])
    else:
        db.add(PushSubscription(
            user_id=user.id,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth=data.auth,
        ))
        logger.info("Push subscription created: user=%d endpoint_prefix=%s", user.id, data.endpoint[:40])
    db.commit()
    return {"ok": True}


@router.delete("/unsubscribe", status_code=204)
def unsubscribe(endpoint: Optional[str] = None, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    q = db.query(PushSubscription).filter(PushSubscription.user_id == user.id)
    if endpoint:
        q = q.filter(PushSubscription.endpoint == endpoint)
    deleted = q.delete(synchronize_session=False)
    db.commit()
    logger.info("Push unsubscribe: user=%d removed=%d specific=%s", user.id, deleted, bool(endpoint))


@router.get("/status")
def status(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    count = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).count()
    return {"subscribed": count > 0, "configured": bool(settings.VAPID_PUBLIC_KEY)}


@router.post("/test")
async def test_push(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Send a test push notification to the current user.

    Always logs to notification_log (visible in the bell panel).
    Also sends a Web Push if VAPID is configured and the user has a subscription.
    """
    from core.push import _log_notification, _send_one_raising
    _log_notification(db, user.id, "Kegelkasse 🎳", "Push-Benachrichtigungen funktionieren!", "/")
    if not settings.VAPID_PRIVATE_KEY:
        return {"sent": 0, "logged": True, "errors": ["VAPID not configured — notification logged only"]}
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    if not subs:
        return {"sent": 0, "logged": True, "errors": ["No push subscription — notification logged only"]}
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
    logger.info("Test push: user=%d sent=%d errors=%d", user.id, sent, len(errors))
    return {"sent": sent, "logged": True, "errors": errors}


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
    reminder_debt: Optional[bool] = None
    reminder_schedule: Optional[bool] = None
    reminder_payments: Optional[bool] = None
    reminder_schedule_days: Optional[int] = None  # per-user days_before for upcoming evening


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


@router.get("/recent")
def get_recent_notifications(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Return unread notifications from the last 30 days for the current user (hybrid loading)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    logs = (
        db.query(NotificationLog)
        .filter(
            NotificationLog.user_id == user.id,
            NotificationLog.created_at >= cutoff,
            NotificationLog.is_read == False,  # noqa: E712
        )
        .order_by(NotificationLog.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": log.id,
            "title": log.title,
            "body": log.body,
            "url": log.url,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


class MarkReadRequest(BaseModel):
    ids: Optional[list[int]] = None  # None = mark all unread as read


@router.post("/notifications/read", status_code=204)
def mark_notifications_read(data: MarkReadRequest = MarkReadRequest(),
                             db: Session = Depends(get_db),
                             user: User = Depends(require_club_member)):
    """Mark notifications as read server-side. Pass ids to mark specific ones, omit to mark all."""
    q = db.query(NotificationLog).filter(
        NotificationLog.user_id == user.id,
        NotificationLog.is_read == False,  # noqa: E712
    )
    if data.ids:
        q = q.filter(NotificationLog.id.in_(data.ids))
    q.update({"is_read": True}, synchronize_session=False)
    db.commit()


@router.post("/trigger-reminders")
async def trigger_reminders(db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    """Admin: manually trigger all reminder checks now (for testing / catchup)."""
    from core.reminders import send_all_reminders
    await send_all_reminders(db)
    return {"ok": True}

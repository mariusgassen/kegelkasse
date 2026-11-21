"""Notification helpers for club-document review requests.

Kept separate from the API router and from the general reminder job so both can use the
same delivery rules: initial request, manual "remind now" and the automatic daily reminder.
"""
import logging
from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from core.push import notify_user
from models.document import ClubDocumentAcknowledgement, ClubDocumentReviewRecipient, ClubDocumentReviewRequest
from models.user import User

logger = logging.getLogger(__name__)

CATEGORY = "documents"


def request_url(document_id: int) -> str:
    """Deep link to the document card (legacy hash form, also understood by the new router)."""
    return f"/#documents?item={document_id}"


def recipient_ids(db: Session, req: ClubDocumentReviewRequest) -> list[int]:
    return [r.user_id for r in db.query(ClubDocumentReviewRecipient).filter(
        ClubDocumentReviewRecipient.request_id == req.id
    ).all() if r.user_id is not None]


def responded_user_ids(db: Session, req: ClubDocumentReviewRequest) -> set[int]:
    """A response is simply an acknowledgement of the requested document version."""
    ids = recipient_ids(db, req)
    if not ids:
        return set()
    rows = db.query(ClubDocumentAcknowledgement.user_id).filter(
        ClubDocumentAcknowledgement.document_id == req.document_id,
        ClubDocumentAcknowledgement.user_id.in_(ids),
    ).all()
    return {row[0] for row in rows if row[0] is not None}


def notify_new_request(db: Session, req: ClubDocumentReviewRequest) -> int:
    """Send the initial request to every recipient. Returns the number of deliveries."""
    rows = db.query(ClubDocumentReviewRecipient, User).join(
        User, ClubDocumentReviewRecipient.user_id == User.id
    ).filter(
        ClubDocumentReviewRecipient.request_id == req.id,
        User.is_active == True,  # noqa: E712
    ).all()
    now = datetime.now(timezone.utc)
    sent = 0
    for recipient, user in rows:
        body = req.message.strip() if req.message else ""
        delivered = notify_user(
            db, user,
            f"📄 {req.title}",
            f"{body}\n\nBitte bis zum {req.deadline.strftime('%d.%m.%Y')} prüfen und bestätigen.",
            request_url(req.document_id),
            category=CATEGORY,
            extra={"tag": f"document-review-{req.id}", "doc": req.document_id},
        )
        if delivered:
            recipient.notified_at = now
            sent += 1
    db.commit()
    return sent


def send_review_reminders(db: Session, req: ClubDocumentReviewRequest, today: date | None = None) -> int:
    """Remind recipients who have not responded yet; at most one reminder per day each.

    Returns the number of recipients actually reminded (a member with all channels off is
    not counted and not marked, so a later manual reminder can still reach them).
    """
    if req.status != "open":
        return 0
    today = today or date.today()
    answered = responded_user_ids(db, req)
    rows = db.query(ClubDocumentReviewRecipient, User).join(
        User, ClubDocumentReviewRecipient.user_id == User.id
    ).filter(
        ClubDocumentReviewRecipient.request_id == req.id,
        User.is_active == True,  # noqa: E712
    ).all()
    now = datetime.now(timezone.utc)
    sent = 0
    for recipient, user in rows:
        if user.id in answered:
            continue
        reminded_on = recipient.reminded_at.date() if isinstance(recipient.reminded_at, datetime) \
            else recipient.reminded_at
        if reminded_on == today:
            continue
        delivered = notify_user(
            db, user,
            f"⏰ Erinnerung: {req.title}",
            f"Bitte bis zum {req.deadline.strftime('%d.%m.%Y')} prüfen und bestätigen.",
            request_url(req.document_id),
            category=CATEGORY,
            extra={"tag": f"document-review-reminder-{req.id}", "doc": req.document_id},
        )
        if delivered:
            recipient.reminded_at = now
            recipient.reminder_count = (recipient.reminder_count or 0) + 1
            sent += 1
    db.commit()
    if sent:
        logger.info("Document review reminders: request=%s sent=%d", req.id, sent)
    return sent

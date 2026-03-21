from sqlalchemy import Boolean, Column, Integer, Text, DateTime, ForeignKey
from sqlalchemy.sql import func

from core.database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscription"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NotificationLog(Base):
    """Server-side log of notifications sent to each user.

    Enables hybrid notification loading: even without a PWA/SW the app can
    fetch recent notifications from the API on boot.  Entries older than 30
    days are not returned by the endpoint (no scheduled cleanup needed).
    """
    __tablename__ = "notification_log"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    title = Column(Text, nullable=False)
    body = Column(Text, nullable=False, default='')
    url = Column(Text, nullable=False, default='/')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_read = Column(Boolean, nullable=False, default=False)

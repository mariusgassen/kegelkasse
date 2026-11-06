from sqlalchemy import Column, DateTime, Text
from sqlalchemy.sql import func

from core.database import Base


class AppState(Base):
    """Instance-wide key/value state that has to survive restarts (not per club).

    Currently holds ``announced_version``: the last app version a release push went out for.
    """
    __tablename__ = "app_state"
    key = Column(Text, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

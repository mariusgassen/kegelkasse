from sqlalchemy import JSON, Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from core.database import Base


class Sticker(Base):
    """A club sticker put up somewhere (usually on a trip or holiday), posted to the sticker wall.

    Every post carries a photo (stored through ``core.storage``, served at ``/uploads/<key>``),
    a human place name and coordinates for the world map. ``stuck_on`` is the day the sticker
    went up, which may be well before it was posted.
    """
    __tablename__ = "sticker"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    media_url = Column(String, nullable=False)  # the cover photo (first of the post)
    extra_media = Column(JSON, nullable=True)  # further photos, in order
    place_name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    caption = Column(Text, nullable=True)
    stuck_on = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)

    __table_args__ = (Index("ix_sticker_club_created", "club_id", "created_at"),)

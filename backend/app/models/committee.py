"""Vergnügungsausschuss (Entertainment Committee) models."""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.sql import func

from core.database import Base


class ClubAnnouncement(Base):
    """Announcement posted by the entertainment committee."""
    __tablename__ = "club_announcement"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    text = Column(Text, nullable=True)
    media_url = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)


class ClubTrip(Base):
    """Kegelfahrt — a club bowling trip planned by the entertainment committee."""
    __tablename__ = "club_trip"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False)
    date = Column(DateTime(timezone=True), nullable=False)
    destination = Column(String, nullable=False)
    note = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

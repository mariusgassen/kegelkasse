"""Vergnügungsausschuss (Entertainment Committee) models."""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
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


class ClubPoll(Base):
    """Poll created by the committee or admins — supports single and multi-answer modes."""
    __tablename__ = "club_poll"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    text = Column(Text, nullable=True)
    mode = Column(String, nullable=False, default="single")  # 'single' | 'multi'
    is_closed = Column(Boolean, default=False, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PollOption(Base):
    """An answer option within a ClubPoll."""
    __tablename__ = "poll_option"
    id = Column(Integer, primary_key=True)
    poll_id = Column(Integer, ForeignKey("club_poll.id", ondelete="CASCADE"), nullable=False)
    text = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)


class PollVote(Base):
    """A single vote cast by a user for a poll option."""
    __tablename__ = "poll_vote"
    id = Column(Integer, primary_key=True)
    poll_id = Column(Integer, ForeignKey("club_poll.id", ondelete="CASCADE"), nullable=False)
    option_id = Column(Integer, ForeignKey("poll_option.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("poll_id", "option_id", "user_id", name="uq_poll_vote"),)

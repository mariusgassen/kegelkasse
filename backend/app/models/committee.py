"""Vergnügungsausschuss (Entertainment Committee) models."""
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, Float, ForeignKey, JSON, Text, UniqueConstraint
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
    # Last day of a multi-day trip (migration 062); null = single-day trip.
    end_date = Column(DateTime(timezone=True), nullable=True)
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


class TripParticipant(Base):
    """A member (or guest) who joins a Kegelfahrt and shares its costs (migration 065)."""
    __tablename__ = "trip_participant"
    __table_args__ = (UniqueConstraint("trip_id", "regular_member_id", name="uq_trip_participant"),)
    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("club_trip.id", ondelete="CASCADE"), nullable=False, index=True)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id", ondelete="CASCADE"), nullable=False)


class TripExpense(Base):
    """One entry in a trip's cash box.

    kind='expense': paid_by laid out `amount` for split_member_ids (null = all participants).
    kind='transfer': paid_by handed `amount` to to_member_id (an advance or a settle-up payment).
    """
    __tablename__ = "trip_expense"
    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("club_trip.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String, nullable=False, default="expense")
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    paid_by_member_id = Column(Integer, ForeignKey("regular_member.id", ondelete="CASCADE"), nullable=False)
    to_member_id = Column(Integer, ForeignKey("regular_member.id", ondelete="CASCADE"), nullable=True)
    split_member_ids = Column(JSON, nullable=True)
    date = Column(Date, nullable=True)
    created_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)

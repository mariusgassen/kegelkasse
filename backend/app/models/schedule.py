import enum

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class RsvpStatus(str, enum.Enum):
    attending = "attending"
    absent = "absent"


class ScheduledEvening(Base):
    """A planned future bowling evening — members can RSVP in advance."""
    __tablename__ = "scheduled_evening"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    venue = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("user.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    rsvps = relationship("MemberRsvp", back_populates="scheduled_evening", cascade="all, delete-orphan")
    guests = relationship("ScheduledEveningGuest", back_populates="scheduled_evening", cascade="all, delete-orphan")


class MemberRsvp(Base):
    """RSVP by a regular member for a scheduled evening."""
    __tablename__ = "member_rsvp"
    id = Column(Integer, primary_key=True, index=True)
    scheduled_evening_id = Column(Integer, ForeignKey("scheduled_evening.id", ondelete="CASCADE"), nullable=False)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id"), nullable=False)
    status = Column(String, nullable=False)  # RsvpStatus value
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    scheduled_evening = relationship("ScheduledEvening", back_populates="rsvps")
    __table_args__ = (UniqueConstraint("scheduled_evening_id", "regular_member_id", name="uq_rsvp_member_evening"),)


class ScheduledEveningGuest(Base):
    """A guest (known or new) pre-registered for a scheduled evening."""
    __tablename__ = "scheduled_evening_guest"
    id = Column(Integer, primary_key=True, index=True)
    scheduled_evening_id = Column(Integer, ForeignKey("scheduled_evening.id", ondelete="CASCADE"), nullable=False)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    scheduled_evening = relationship("ScheduledEvening", back_populates="guests")

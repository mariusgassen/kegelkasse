from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class Club(Base):
    __tablename__ = "club"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    members = relationship("User", back_populates="club")
    regular_members = relationship("RegularMember", back_populates="club")
    penalty_types = relationship("PenaltyType", back_populates="club")
    game_templates = relationship("GameTemplate", back_populates="club")
    evenings = relationship("Evening", back_populates="club")
    settings = relationship("ClubSettings", back_populates="club", uselist=False)
    presidents = relationship("ClubPresident", back_populates="club", order_by="ClubPresident.year.desc()")
    pins = relationship("ClubPin", back_populates="club")


class ClubSettings(Base):
    """
    Editable club configuration — managed by admins only.
    Stores home venue, logo URL, brand colors, and other preferences.
    """
    __tablename__ = "club_setting"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("club.id"), unique=True, nullable=False)
    home_venue = Column(String, nullable=True)  # default venue pre-filled in new evenings
    logo_url = Column(String, nullable=True)  # uploaded logo path
    primary_color = Column(String, default="#e8a020")
    secondary_color = Column(String, default="#6b7c5a")
    extra = Column(JSON, default=dict)  # future extensibility
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    club = relationship("Club", back_populates="settings")


class ClubPresident(Base):
    """Tracks the annual president (Präsident) — determined via a president-game each year."""
    __tablename__ = "club_president"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False)
    year = Column(Integer, nullable=False)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id", ondelete="SET NULL"), nullable=True)
    name = Column(String, nullable=False)  # denormalized for display
    evening_id = Column(Integer, ForeignKey("evening.id", ondelete="SET NULL"), nullable=True)
    game_id = Column(Integer, ForeignKey("game.id", ondelete="SET NULL"), nullable=True)
    determined_at = Column(DateTime(timezone=True), nullable=True)
    club = relationship("Club", back_populates="presidents")


class ClubPin(Base):
    """Physical club pins — temporarily held by one member, must be brought to each evening."""
    __tablename__ = "club_pin"
    id = Column(Integer, primary_key=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=False, default="📌")
    holder_regular_member_id = Column(Integer, ForeignKey("regular_member.id", ondelete="SET NULL"), nullable=True)
    holder_name = Column(String, nullable=True)  # denormalized
    assigned_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    club = relationship("Club", back_populates="pins")

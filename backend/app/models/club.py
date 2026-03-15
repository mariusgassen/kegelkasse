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

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class ClubTeam(Base):
    """Named team slot defined at club level — members are drawn randomly per evening."""
    __tablename__ = "club_team"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class RegularMember(Base):
    """Club's roster of regular players (Stammspieler) and saved guests."""
    __tablename__ = "regular_member"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    name = Column(String, nullable=False)
    nickname = Column(String, nullable=True)
    is_guest = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=True)  # linked user account
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    club = relationship("Club", back_populates="regular_members")


class Evening(Base):
    """A single bowling evening session."""
    __tablename__ = "evening"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    date = Column(String, nullable=False)  # ISO YYYY-MM-DD
    venue = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    is_closed = Column(Boolean, default=False)  # true = archived in history
    scheduled_evening_id = Column(Integer, ForeignKey("scheduled_evening.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("user.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    club = relationship("Club", back_populates="evenings")
    players = relationship("EveningPlayer", back_populates="evening", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="evening", cascade="all, delete-orphan")
    penalty_log = relationship("PenaltyLog", back_populates="evening", cascade="all, delete-orphan")
    games = relationship("Game", back_populates="evening", cascade="all, delete-orphan")
    drink_rounds = relationship("DrinkRound", back_populates="evening", cascade="all, delete-orphan")


class EveningPlayer(Base):
    """A player participating in a specific evening (regular member or guest)."""
    __tablename__ = "evening_player"
    id = Column(Integer, primary_key=True, index=True)
    evening_id = Column(Integer, ForeignKey("evening.id"), nullable=False)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id"), nullable=True)
    name = Column(String, nullable=False)  # denormalized — works for guests too
    team_id = Column(Integer, ForeignKey("team.id"), nullable=True)
    is_king = Column(Boolean, default=False)
    evening = relationship("Evening", back_populates="players")
    regular_member = relationship("RegularMember")
    team = relationship("Team", back_populates="members")


class Team(Base):
    """A team within a specific evening."""
    __tablename__ = "team"
    id = Column(Integer, primary_key=True, index=True)
    evening_id = Column(Integer, ForeignKey("evening.id"), nullable=False)
    name = Column(String, nullable=False)
    evening = relationship("Evening", back_populates="teams")
    members = relationship("EveningPlayer", back_populates="team")

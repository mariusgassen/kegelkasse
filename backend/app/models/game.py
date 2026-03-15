from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, JSON, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base

class WinnerType(str, enum.Enum):
    team = "team"
    individual = "individual"
    either = "either"   # template accepts both

class GameTemplate(Base):
    """
    Club-defined game template (e.g. "Große Hausnummer", "Fass", "Fußball").
    Admins manage these. Members pick them when creating a game in an evening.
    """
    __tablename__ = "game_template"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    winner_type = Column(Enum(WinnerType), default=WinnerType.either)
    is_opener = Column(Boolean, default=False)          # marks opening/crown game (Große Hausnummer)
    default_loser_penalty = Column(Float, default=0)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    club = relationship("Club", back_populates="game_templates")

class Game(Base):
    """A game played during a specific evening."""
    __tablename__ = "game"
    id = Column(Integer, primary_key=True, index=True)
    evening_id = Column(Integer, ForeignKey("evening.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("game_template.id"), nullable=True)
    sort_order = Column(Integer, default=0)
    name = Column(String, nullable=False)
    is_opener = Column(Boolean, default=False)          # opening/crown game flag
    winner_type = Column(Enum(WinnerType), default=WinnerType.either)
    winner_ref = Column(String, nullable=True)          # "t:{team_id}" or "p:{player_id}"
    winner_name = Column(String, nullable=True)
    scores = Column(JSON, default=dict)                 # {"t:1": 42, "p:3": 38}
    loser_penalty = Column(Float, default=0)
    note = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    client_timestamp = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    evening = relationship("Evening", back_populates="games")
    template = relationship("GameTemplate")

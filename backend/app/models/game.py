import enum

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, JSON, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class GameStatus(str, enum.Enum):
    open = "open"
    running = "running"
    finished = "finished"


class WinnerType(str, enum.Enum):
    team = "team"
    individual = "individual"
    # Note: 'either' kept in DB enum for legacy rows; data migrated via 039


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
    winner_type = Column(Enum(WinnerType), default=WinnerType.individual)
    is_opener = Column(Boolean, default=False)  # marks opening/crown game (Große Hausnummer)
    is_president_game = Column(Boolean, default=False)  # winner becomes club president for the year
    turn_mode = Column(String(20), nullable=True)  # 'alternating' | 'block' (team games only)
    default_loser_penalty = Column(Float, default=0)
    per_point_penalty = Column(Float, default=0)
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
    is_opener = Column(Boolean, default=False)  # opening/crown game flag
    is_president_game = Column(Boolean, default=False)  # winner becomes president for this year
    winner_type = Column(Enum(WinnerType), default=WinnerType.individual)
    turn_mode = Column(String(20), nullable=True)  # 'alternating' | 'block' (team games only)
    winner_ref = Column(String, nullable=True)  # "t:{team_id}" or "p:{player_id}"
    winner_name = Column(String, nullable=True)
    scores = Column(JSON, default=dict)  # {"t:1": 42, "p:3": 38}
    loser_penalty = Column(Float, default=0)
    per_point_penalty = Column(Float, default=0)  # extra penalty per point diff from winner
    note = Column(Text, nullable=True)
    status = Column(String, default="open", nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    is_deleted = Column(Boolean, default=False)
    client_timestamp = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    evening = relationship("Evening", back_populates="games")
    template = relationship("GameTemplate")
    throws = relationship("GameThrowLog", back_populates="game",
                          order_by="GameThrowLog.throw_num",
                          cascade="all, delete-orphan")


class GameThrowLog(Base):
    """Per-throw data captured by the camera recognition system."""
    __tablename__ = "game_throw_log"
    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("game.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(Integer, ForeignKey("evening_player.id", ondelete="SET NULL"), nullable=True)
    throw_num = Column(Integer, nullable=False)
    pins = Column(Integer, nullable=False)
    cumulative = Column(Integer, nullable=True)
    pin_states = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    game = relationship("Game", back_populates="throws")

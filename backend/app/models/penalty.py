import enum

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class PenaltyMode(str, enum.Enum):
    euro = "euro"
    count = "count"


# Synthesized Web Audio presets a penalty type's sound_key may reference (frontend lib/soundboard.ts
# holds the actual synthesis — this is just the server-side allowlist so a bad value 422s instead of
# silently no-op'ing client-side).
SOUND_PRESET_KEYS = (
    "buzzer", "bell", "cash_register", "sad_trombone", "drum_hit", "crowd_groan", "laser",
)


class PenaltyType(Base):
    """
    Club-level penalty type (e.g. "Late arrival", "Null", "Bank shot").
    Admins manage these; members use them to log penalties.
    """
    __tablename__ = "penalty_type"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    icon = Column(String, default="⚠️")
    name = Column(String, nullable=False)
    default_amount = Column(Float, default=0.5)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    sound_key = Column(String, nullable=True)  # optional preset audio call-out, played when logged
    club = relationship("Club", back_populates="penalty_types")


class PenaltyLog(Base):
    """An individual penalty entry in an evening's log."""
    __tablename__ = "penalty_log"
    id = Column(Integer, primary_key=True, index=True)
    evening_id = Column(Integer, ForeignKey("evening.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("evening_player.id"), nullable=True)
    team_id = Column(Integer, ForeignKey("team.id"), nullable=True)  # team penalty
    player_name = Column(String, nullable=False)  # denormalized
    penalty_type_name = Column(String, nullable=False)
    icon = Column(String, default="⚠️")
    amount = Column(Float, nullable=False)
    mode = Column(Enum(PenaltyMode), default=PenaltyMode.euro)
    unit_amount = Column(Float, nullable=True)  # default_amount at log time (count mode only)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id"), nullable=True)  # set for absence entries
    game_id = Column(Integer, ForeignKey("game.id", ondelete="SET NULL"), nullable=True)  # set for auto loser penalties
    is_deleted = Column(Boolean, default=False)  # soft delete
    created_by = Column(Integer, ForeignKey("user.id"))
    client_timestamp = Column(Float, nullable=False)  # for offline sync
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    evening = relationship("Evening", back_populates="penalty_log")
    player = relationship("EveningPlayer")
    team = relationship("Team")

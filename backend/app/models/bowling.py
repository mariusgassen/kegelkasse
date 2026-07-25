from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index
from sqlalchemy.sql import func

from core.database import Base


class BowlingScore(Base):
    """
    A finished game of the hidden mini bowling Easter egg. One row per game played;
    the club-wide leaderboard is the top scores across all rows for a club.

    `player_name` is denormalized (Kegelname/nickname or account name at submit time) so the
    leaderboard survives a member being renamed, unlinked, or removed.
    """
    __tablename__ = "bowling_score"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id", ondelete="SET NULL"), nullable=True)
    player_name = Column(String, nullable=False)
    score = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_bowling_score_club_score", "club_id", "score"),)

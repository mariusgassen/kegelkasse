from sqlalchemy import Column, Integer, Float, Text, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from core.database import Base


class SeasonSnapshot(Base):
    __tablename__ = "season_snapshot"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    closed_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_by_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    ranking_data = Column(JSON, nullable=True)
    member_count = Column(Integer, default=0)
    evening_count = Column(Integer, default=0)
    carry_over_count = Column(Integer, default=0)
    total_penalties = Column(Float, default=0.0)
    total_payments = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)

    __table_args__ = (UniqueConstraint("club_id", "year", name="uq_season_snapshot_club_year"),)

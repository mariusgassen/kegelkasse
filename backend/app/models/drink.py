from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base

class DrinkType(str, enum.Enum):
    beer = "beer"
    shots = "shots"

class DrinkRound(Base):
    """A round of drinks during an evening, tracking who participated."""
    __tablename__ = "drink_round"
    id = Column(Integer, primary_key=True, index=True)
    evening_id = Column(Integer, ForeignKey("evening.id"), nullable=False)
    drink_type = Column(Enum(DrinkType), nullable=False)
    variety = Column(String, nullable=True)             # e.g. "Korn", "Jäger", "Weizen"
    participant_ids = Column(JSON, default=list)        # list of evening_player IDs
    is_deleted = Column(Boolean, default=False)
    client_timestamp = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    evening = relationship("Evening", back_populates="drink_rounds")

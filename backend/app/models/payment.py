from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey
from sqlalchemy.sql import func

from core.database import Base


class MemberPayment(Base):
    """Cash payment recorded by admin for a regular member."""
    __tablename__ = "member_payment"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id"), nullable=False)
    amount = Column(Float, nullable=False)   # always positive — payment received
    note = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("user.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

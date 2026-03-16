from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Enum
from sqlalchemy.sql import func
import enum

from core.database import Base


class PaymentRequestStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"


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


class PaymentRequest(Base):
    """Member-initiated payment request — links to a PayPal.me transfer, confirmed by admin."""
    __tablename__ = "payment_request"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id"), nullable=False)
    amount = Column(Float, nullable=False)   # debt at time of request
    note = Column(String, nullable=True)
    status = Column(Enum(PaymentRequestStatus), default=PaymentRequestStatus.pending, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(Integer, ForeignKey("user.id"), nullable=True)


class ClubExpense(Base):
    """Club-level expense not tied to any member (e.g. lane rental, bowling trip)."""
    __tablename__ = "club_expense"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    amount = Column(Float, nullable=False)   # positive = money going out of treasury
    description = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("user.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

"""Kassenprüfung — a frozen treasury report for a period, signed off by the club's auditors."""
from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey, JSON, Text, UniqueConstraint
from sqlalchemy.sql import func

from core.database import Base


class TreasuryAudit(Base):
    """One audit of the treasury for ``period_start``–``period_end`` (inclusive).

    ``snapshot`` is computed once at creation and never recomputed: it is the record the
    auditors signed, so a later edit to a booking must not silently change what they approved.
    Changes made after the audit show up in the *next* audit's edit/delete lists instead.
    """
    __tablename__ = "treasury_audit"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=True)
    period_start = Column(Date(), nullable=False)
    period_end = Column(Date(), nullable=False)
    snapshot = Column(JSON, nullable=False)
    created_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TreasuryAuditSignature(Base):
    """An auditor's verdict on an audit — approval or an objection, with an optional remark."""
    __tablename__ = "treasury_audit_signature"
    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("treasury_audit.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    signer_name = Column(String, nullable=False)  # frozen display name, survives renames/unlinking
    approved = Column(Boolean, nullable=False)
    note = Column(Text, nullable=True)
    signed_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("audit_id", "user_id", name="uq_treasury_audit_signature_user"),)

"""Vereinsdokumente — versioned club PDFs with a members' acknowledgement trail.

Each upload is its own row: ``group_id`` ties the versions of one document together, while every
version keeps the metadata and the confirmations it was actually approved with. The newest version
of a group is the current one; older versions stay readable/downloadable as history.

An acknowledgement is a simple electronic confirmation ("Kenntnis genommen" / "Zugestimmt"), not a
qualified electronic signature. The frozen ``responder_name`` keeps the trail readable if a member
is renamed or leaves the club.
"""
from sqlalchemy import Boolean, Column, DateTime, Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from core.database import Base

DOCUMENT_TYPES = ("satzung", "geschaeftsordnung", "protokoll", "sonstiges")
ACK_RESPONSES = ("acknowledged", "agreed")


class ClubDocument(Base):
    __tablename__ = "club_document"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    document_type = Column(String, nullable=False, default="sonstiges")
    version = Column(String, nullable=True)
    decision_date = Column(Date(), nullable=True)   # Beschlussdatum
    effective_date = Column(Date(), nullable=True)  # gültig ab
    summary = Column(Text, nullable=True)           # short KI/admin summary of the document
    change_summary = Column(Text, nullable=True)    # what changed compared with the previous version
    file_key = Column(String, nullable=False)       # private storage key, never a public URL
    file_name = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    uploaded_by_name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ClubDocumentAcknowledgement(Base):
    __tablename__ = "club_document_acknowledgement"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("club_document.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    responder_name = Column(String, nullable=False)
    response = Column(String, nullable=False)
    confirmed_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (UniqueConstraint("document_id", "user_id", name="uq_club_document_ack_user"),)


class ClubDocumentReviewRequest(Base):
    """An admin's request to review/confirm one document version by a Frist.

    Responses are deliberately not stored twice: a recipient has answered as soon as a
    ``ClubDocumentAcknowledgement`` exists for the requested document version. Withdrawing
    that acknowledgement reopens the request, which is what the member expects.
    """

    __tablename__ = "club_document_review_request"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("club_document.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_by_name = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=True)
    deadline = Column(Date(), nullable=False)
    reminder_days_before = Column(Integer, nullable=False, default=2)
    auto_reminders = Column(Boolean, nullable=False, default=True)
    status = Column(String, nullable=False, default="open", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)


class ClubDocumentReviewRecipient(Base):
    """Per-recipient delivery/reminder state; the response itself lives in the acknowledgement."""

    __tablename__ = "club_document_review_recipient"

    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(
        Integer, ForeignKey("club_document_review_request.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    user_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    responder_name = Column(String, nullable=False)
    notified_at = Column(DateTime(timezone=True), nullable=True)
    reminded_at = Column(DateTime(timezone=True), nullable=True)
    reminder_count = Column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("request_id", "user_id", name="uq_club_doc_review_recipient"),)

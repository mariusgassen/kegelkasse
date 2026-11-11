"""Community-driven roadmap and member upvotes for Kegelkasse 2.0."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from core.database import Base


class RoadmapItem(Base):
    """An item or idea on the Kegelkasse roadmap.

    ``club_id`` is NULL for official Kegelkasse 2.0 roadmap items visible to all clubs.
    If ``club_id`` is set, it was submitted by a member of that club (community proposal).
    ``status`` can be: 'planned', 'in_progress', 'completed', 'idea', 'rejected'.
    """
    __tablename__ = "roadmap_item"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    author_name = Column(String(100), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="idea", index=True)
    category = Column(String(30), nullable=True, default="feature")
    target_version = Column(String(20), nullable=True)
    is_official = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RoadmapVote(Base):
    """A member upvote on a roadmap item."""
    __tablename__ = "roadmap_vote"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("roadmap_item.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("item_id", "user_id", name="uq_roadmap_vote"),
    )

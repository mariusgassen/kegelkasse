"""Comment and emoji reaction models for highlights and announcements."""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.sql import func

from core.database import Base


class Comment(Base):
    """A comment on a highlight or announcement."""
    __tablename__ = "comment"
    id = Column(Integer, primary_key=True)
    parent_type = Column(String(20), nullable=False)  # 'highlight' or 'announcement'
    parent_id = Column(Integer, nullable=False)
    text = Column(Text, nullable=True)
    media_url = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_deleted = Column(Boolean, default=False, nullable=False)


class CommentReaction(Base):
    """An emoji reaction on a comment."""
    __tablename__ = "comment_reaction"
    id = Column(Integer, primary_key=True)
    comment_id = Column(Integer, ForeignKey("comment.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    emoji = Column(String(10), nullable=False)
    __table_args__ = (
        UniqueConstraint('comment_id', 'user_id', 'emoji', name='uq_comment_reaction'),
    )

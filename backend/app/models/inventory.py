"""Zeugwart inventory — what the club owns (stickers, pins, shirts, …) and what it still needs."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from core.database import Base


class InventoryItem(Base):
    """One kind of club equipment or merchandise.

    ``stock`` is the current count and is only ever changed through an ``InventoryMovement``,
    so the history always adds up to it. ``target`` is how many the club wants on hand; the
    difference is what the Zeugwart still has to get. Removing an item sets ``is_active=False``
    so its history survives.
    """
    __tablename__ = "inventory_item"
    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("club.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    stock = Column(Integer, nullable=False, default=0)
    target = Column(Integer, nullable=False, default=0)
    note = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class InventoryMovement(Base):
    """A change to an item's stock: ``delta`` in (+) or out (−), with the resulting count."""
    __tablename__ = "inventory_movement"
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_item.id", ondelete="CASCADE"), nullable=False, index=True)
    delta = Column(Integer, nullable=False)
    stock_after = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    actor_name = Column(String, nullable=False)  # frozen display name, survives renames/unlinking
    created_at = Column(DateTime(timezone=True), server_default=func.now())

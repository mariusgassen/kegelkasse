from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base

class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"       # club admin — can manage club settings, invite members
    member = "member"     # regular club member

class User(Base):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.member)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    preferred_locale = Column(String, default="de")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    club = relationship("Club", back_populates="members")

class InviteToken(Base):
    __tablename__ = "invite_token"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("user.id"), nullable=False)
    used_by = Column(Integer, ForeignKey("user.id"), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)

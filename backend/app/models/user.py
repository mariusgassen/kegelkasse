import enum

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"  # club admin — can manage club settings, invite members
    member = "member"  # regular club member


class User(Base):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.member)
    club_id = Column(Integer, ForeignKey("club.id"), nullable=True)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id"), nullable=True)
    avatar = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    preferred_locale = Column(String, default="de")
    push_preferences = Column(JSON, nullable=True)  # {penalties, evenings, schedule, payments, games, members}
    last_digest_at = Column(DateTime(timezone=True), nullable=True)  # last personalized email digest sent
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
    regular_member_id = Column(Integer, ForeignKey("regular_member.id"), nullable=True)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_token"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("user.id"), nullable=True)  # null for self-service resets
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)


class RefreshToken(Base):
    """One row per issued refresh token — i.e. one row per login *step*.

    The raw token never touches the database: only its SHA-256 hash is stored,
    so a database dump cannot be replayed as a session (same reasoning as
    hashing passwords). Rotation means every use mints a successor and revokes
    the presented row; ``family_id`` ties a whole login lineage together so a
    replayed (stolen) token can take the entire family down with it.
    """
    __tablename__ = "refresh_token"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    family_id = Column(String(36), index=True, nullable=False)
    user_agent = Column(String(255), nullable=True)  # for a future "active sessions" view
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), index=True, nullable=False)
    # Spent by a rotation. Distinct from revoked_at on purpose: a rotated token
    # is briefly replayable (see REFRESH_REUSE_GRACE_SECONDS), a revoked one is
    # never usable again — logging out must mean logged out.
    rotated_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

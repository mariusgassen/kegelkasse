import enum

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from core.database import Base


class UserRole(str, enum.Enum):
    superadmin = "superadmin"  # platform operator — all clubs, backups, all users, global roadmap
    it_admin = "it_admin"  # technical admin — SMTP, Telegram, AI, config export/import, tokens
    admin = "admin"  # club admin — club settings, rules catalogue, invites, role assignment
    treasurer = "treasurer"  # Kassenwart — payments, expenses, payment requests, season, audit freeze
    auditor = "auditor"  # Kassenprüfer — signs off treasury audits (four-eyes principle)
    committee = "committee"  # Vergnügungsausschuss — trips, trip expenses, moderates news/polls
    zeugwart = "zeugwart"  # Zeugwart — club inventory items and movements
    member = "member"  # regular club member


# Roles a club admin may assign to members of their own club (never superadmin).
CLUB_ASSIGNABLE_ROLES = (
    UserRole.admin,
    UserRole.it_admin,
    UserRole.treasurer,
    UserRole.auditor,
    UserRole.committee,
    UserRole.zeugwart,
    UserRole.member,
)

_ROLE_PRIORITY = (
    UserRole.superadmin,
    UserRole.it_admin,
    UserRole.admin,
    UserRole.treasurer,
    UserRole.auditor,
    UserRole.committee,
    UserRole.zeugwart,
    UserRole.member,
)

_VALID_ROLE_VALUES = {r.value for r in UserRole}


def normalize_roles(raw_roles: list | set | tuple | None) -> list[str]:
    """Validate and normalize a list of roles into a canonical sorted list (default ``['member']``)."""
    if not raw_roles:
        return [UserRole.member.value]
    cleaned: set[str] = set()
    for r in raw_roles:
        val = r.value if hasattr(r, "value") else str(r)
        if val in _VALID_ROLE_VALUES:
            cleaned.add(val)
    if not cleaned:
        return [UserRole.member.value]
    if len(cleaned) > 1 and UserRole.member.value in cleaned:
        cleaned.discard(UserRole.member.value)
    return sorted(cleaned)


class User(Base):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    roles = Column(JSON, nullable=False, default=lambda: [UserRole.member.value])
    club_id = Column(Integer, ForeignKey("club.id"), nullable=True)
    regular_member_id = Column(Integer, ForeignKey("regular_member.id"), nullable=True)
    avatar = Column(Text, nullable=True)  # /uploads/avatars/<key> URL (legacy rows: base64 data URI)
    # Original data URI kept by scripts/migrate_media_to_s3.py until the copy is verified (migration 067)
    avatar_legacy = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    preferred_locale = Column(String, default="de")
    push_preferences = Column(JSON, nullable=True)  # {penalties, evenings, schedule, payments, games, members}
    last_digest_at = Column(DateTime(timezone=True), nullable=True)  # last personalized email digest sent
    ical_token = Column(String, unique=True, index=True, nullable=True)  # personal calendar-feed secret (migration 061)
    telegram_chat_id = Column(String, nullable=True)  # set once the user links their Telegram via /telegram/link-start
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    club = relationship("Club", back_populates="members")

    @property
    def all_roles(self) -> set[str]:
        """Set of all valid role identifiers assigned to this user."""
        roles_set: set[str] = set()
        if self.roles and isinstance(self.roles, list):
            for r in self.roles:
                val = r.value if hasattr(r, "value") else str(r)
                if val in _VALID_ROLE_VALUES:
                    roles_set.add(val)
        if not roles_set:
            roles_set.add(UserRole.member.value)
        return roles_set

    @property
    def primary_role(self) -> UserRole:
        """Highest-priority role for display or legacy single-role consumers."""
        assigned = self.all_roles
        for candidate in _ROLE_PRIORITY:
            if candidate.value in assigned:
                return candidate
        return UserRole.member

    @property
    def role(self) -> UserRole:
        return self.primary_role

    @role.setter
    def role(self, value: UserRole | str | None) -> None:
        if value is None:
            self.roles = [UserRole.member.value]
        else:
            self.roles = normalize_roles([value])

    def set_roles(self, roles: list[UserRole | str] | set[UserRole | str] | tuple[UserRole | str, ...]) -> None:
        self.roles = normalize_roles(list(roles))

    def has_role(self, *roles: object) -> bool:
        """Return True if user has ANY of the specified roles.

        ``superadmin`` implies all roles except ``auditor`` (which enforces a four-eyes principle).
        Every user implicitly holds ``member``.
        """
        assigned = self.all_roles
        requested = {r.value if hasattr(r, "value") else str(r) for r in roles}
        if UserRole.member.value in requested:
            return True
        if requested & assigned:
            return True
        if UserRole.superadmin.value in assigned and bool(requested - {UserRole.auditor.value}):
            return True
        return False

    @property
    def is_superadmin(self) -> bool:
        return UserRole.superadmin.value in self.all_roles

    @property
    def is_it_admin(self) -> bool:
        return self.has_role(UserRole.it_admin)

    @property
    def is_admin(self) -> bool:
        return self.has_role(UserRole.admin)

    @property
    def is_treasurer(self) -> bool:
        return self.has_role(UserRole.treasurer)

    @property
    def is_auditor(self) -> bool:
        return UserRole.auditor.value in self.all_roles

    @property
    def is_committee(self) -> bool:
        return UserRole.committee.value in self.all_roles

    @property
    def is_zeugwart(self) -> bool:
        return UserRole.zeugwart.value in self.all_roles



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


class TelegramLinkCode(Base):
    """One-time code for the Telegram deep-link handshake (see api/v1/telegram.py).

    A member requests a code, opens ``t.me/<bot>?start=<code>`` in Telegram, and
    the bot's webhook resolves the code back to this row to learn the user's
    ``chat_id`` — the code is the only thing that ever crosses that boundary.
    """
    __tablename__ = "telegram_link_code"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
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

"""Authentication endpoints — login, invite, register."""
import logging
import secrets
import time
from datetime import datetime, timedelta, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user
from core.database import get_db
from core.push import push_to_club_admins
from core.security import verify_password, get_password_hash, create_access_token
from models.user import User, UserRole, InviteToken, PasswordResetToken

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    token: str
    name: Optional[str] = None
    username: str
    password: str


class UpdateLocaleRequest(BaseModel):
    locale: str  # "de" | "en"


def _user_dict(u: User) -> dict:
    return {"id": u.id, "email": u.email, "username": u.username, "name": u.name,
            "role": u.role, "club_id": u.club_id, "preferred_locale": u.preferred_locale,
            "avatar": u.avatar, "regular_member_id": u.regular_member_id}


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # Accept email or username in the email field; compare case-insensitively
    identifier = req.email.strip().lower()
    user = (db.query(User).filter(User.email == identifier).first()
            or db.query(User).filter(User.username == identifier).first())
    if not user or not verify_password(req.password, user.hashed_password):
        logger.warning("Failed login attempt for identifier: %s", identifier)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        logger.warning("Login attempt for deactivated account: %s (user_id=%s)", identifier, user.id)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account deactivated")
    token = create_access_token({"sub": str(user.id)})
    logger.info("User logged in: %s (user_id=%s)", user.email, user.id)
    return {"access_token": token, "user": _user_dict(user)}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return _user_dict(current_user)


@router.patch("/locale")
def update_locale(req: UpdateLocaleRequest, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    current_user.preferred_locale = req.locale
    db.commit()
    return {"ok": True}


class UpdateAvatarRequest(BaseModel):
    avatar: Optional[str] = None  # base64 data URI or null to remove


@router.patch("/avatar")
def update_avatar(req: UpdateAvatarRequest, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    current_user.avatar = req.avatar
    db.commit()
    return _user_dict(current_user)


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


@router.patch("/profile")
def update_profile(req: UpdateProfileRequest, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Update display name, username, login email, and/or password."""
    if req.name is not None:
        current_user.name = req.name.strip()

    if req.username is not None:
        uname = req.username.strip().lower()
        if uname:
            existing = db.query(User).filter(User.username == uname, User.id != current_user.id).first()
            if existing:
                raise HTTPException(status_code=400, detail="Username wird bereits verwendet")
        current_user.username = uname or None

    if req.email is not None:
        email = req.email.strip().lower()
        if email:
            existing = db.query(User).filter(User.email == email, User.id != current_user.id).first()
            if existing:
                raise HTTPException(status_code=400, detail="E-Mail wird bereits verwendet")
            current_user.email = email

    if req.new_password:
        has_real_email = not current_user.email.endswith("@kegelkasse.internal")
        if has_real_email:
            if not req.current_password or not verify_password(req.current_password, current_user.hashed_password):
                raise HTTPException(status_code=400, detail="Aktuelles Passwort falsch")
        current_user.hashed_password = get_password_hash(req.new_password)

    db.commit()
    return _user_dict(current_user)


@router.delete("/me")
def delete_own_account(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Self-service account deactivation (soft delete)."""
    current_user.is_active = False
    db.commit()
    return {"ok": True}


class CreateResetTokenRequest(BaseModel):
    user_id: int


@router.post("/create-reset-token")
def create_reset_token(req: CreateResetTokenRequest, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    """Admin creates a one-time password-reset link for another user."""
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Admin required")
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    token_val = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(days=7)
    reset = PasswordResetToken(token=token_val, user_id=user.id,
                               created_by=current_user.id, expires_at=expires)
    db.add(reset)
    db.commit()
    return {"token": token_val, "reset_url": f"/reset?reset={token_val}", "username": user.username}


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Public endpoint — validates reset token and sets new password."""
    reset = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == req.token,
        PasswordResetToken.used_at == None,
        PasswordResetToken.expires_at > datetime.now(UTC),
    ).first()
    if not reset:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user = db.query(User).filter(User.id == reset.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="User not found")
    user.hashed_password = get_password_hash(req.new_password)
    reset.used_at = datetime.now(UTC)
    db.commit()
    logger.info("Password reset completed for user_id=%s", user.id)
    return {"ok": True}


# --- Self-service password reset request -----------------------------------

# In-memory sliding-window rate limiter. Coolify runs a single app container,
# so per-process state is sufficient; it caps abuse (enumeration probes, mail
# floods) without needing shared storage.
_RESET_WINDOW_SECONDS = 3600
_RESET_MAX_PER_EMAIL = 3
_RESET_MAX_PER_IP = 10
_reset_hits: dict[str, list[float]] = {}


def _rate_limited(key: str, max_hits: int) -> bool:
    """Record a hit for ``key``; return True if it exceeds ``max_hits`` per window."""
    now = time.monotonic()
    cutoff = now - _RESET_WINDOW_SECONDS
    hits = [ts for ts in _reset_hits.get(key, []) if ts > cutoff]
    if len(hits) >= max_hits:
        _reset_hits[key] = hits
        return True
    hits.append(now)
    _reset_hits[key] = hits
    return False


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RequestPasswordResetRequest(BaseModel):
    email: str


@router.post("/request-password-reset")
def request_password_reset(req: RequestPasswordResetRequest, request: Request,
                           background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Public self-service password reset request.

    Always returns a generic response so it never reveals whether an account or
    email exists (no enumeration). When the address matches an active account
    with a real email and a club that has SMTP configured, a one-time,
    time-limited reset link is emailed via the club's own mail server.
    """
    generic = {"ok": True}
    email = (req.email or "").strip().lower()
    if not email:
        return generic
    ip = _client_ip(request)
    # Rate-limit both dimensions; check IP first so a flood can't sidestep it by
    # varying the email. Silently drop when over the limit — same generic reply.
    if _rate_limited(f"ip:{ip}", _RESET_MAX_PER_IP):
        logger.warning("Password reset rate-limited for ip=%s", ip)
        return generic
    if _rate_limited(f"email:{email}", _RESET_MAX_PER_EMAIL):
        logger.warning("Password reset rate-limited for email")
        return generic

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active or user.email.endswith("@kegelkasse.internal"):
        return generic

    from core.email import get_club_email_config, email_theme, send_password_reset_email
    cfg = get_club_email_config(user.club) if user.club else None
    if not cfg:
        # No mail server configured for the club — nothing we can deliver.
        return generic

    token_val = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(hours=1)
    reset = PasswordResetToken(token=token_val, user_id=user.id, expires_at=expires)
    db.add(reset)
    db.commit()

    reset_url = f"/?reset={token_val}"
    background_tasks.add_task(
        send_password_reset_email, cfg, user.email, reset_url,
        email_theme(user.club), user.preferred_locale,
    )
    logger.info("Self-service password reset requested for user_id=%s", user.id)
    return generic


@router.post("/invite")
def create_invite(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Club admin or superadmin can create invites
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Admin required to create invites")
    token_val = secrets.token_urlsafe(32)
    expires = datetime.now(UTC) + timedelta(days=7)
    invite = InviteToken(token=token_val, club_id=current_user.club_id,
                         created_by=current_user.id, expires_at=expires)
    db.add(invite)
    db.commit()
    return {"token": token_val, "expires_at": expires.isoformat(),
            "invite_url": f"/join?token={token_val}"}


@router.get("/invite-info")
def get_invite_info(token: str, db: Session = Depends(get_db)):
    """Return public info about an invite token — used to pre-fill the registration form."""
    invite = db.query(InviteToken).filter(
        InviteToken.token == token,
        InviteToken.used_at == None,
        InviteToken.expires_at > datetime.now(UTC)
    ).first()
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")
    result: dict = {"valid": True, "member_name": None}
    if invite.regular_member_id:
        from models.evening import RegularMember
        member = db.query(RegularMember).filter(RegularMember.id == invite.regular_member_id).first()
        if member:
            result["member_name"] = member.name
    return result


@router.post("/register")
def register_with_invite(req: RegisterRequest,
                         background_tasks: BackgroundTasks,
                         db: Session = Depends(get_db)):
    invite = db.query(InviteToken).filter(
        InviteToken.token == req.token,
        InviteToken.used_at == None,
        InviteToken.expires_at > datetime.now(UTC)
    ).first()
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")
    # For member invites, use the RegularMember's name
    name = req.name
    if invite.regular_member_id and not name:
        from models.evening import RegularMember
        member = db.query(RegularMember).filter(RegularMember.id == invite.regular_member_id).first()
        if member:
            name = member.name
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    uname = req.username.strip().lower()
    if db.query(User).filter(User.username == uname).first():
        raise HTTPException(status_code=400, detail="Username wird bereits verwendet")
    user = User(
        email=f"member_{secrets.token_hex(6)}@kegelkasse.internal",
        name=name,
        username=uname,
        hashed_password=get_password_hash(req.password),
        role=UserRole.member,
        club_id=invite.club_id,
        regular_member_id=invite.regular_member_id,
    )
    db.add(user)
    db.flush()
    # If this is a generic invite (not member-specific), auto-create a roster entry
    if not invite.regular_member_id and user.club_id:
        from models.evening import RegularMember
        member = RegularMember(club_id=user.club_id, name=user.name)
        db.add(member)
        db.flush()
        user.regular_member_id = member.id
    invite.used_at = datetime.now(UTC)
    invite.used_by = user.id
    db.commit()
    if user.club_id:
        background_tasks.add_task(
            push_to_club_admins,
            db,
            user.club_id,
            "👋 Neues Mitglied",
            f"{user.name} ist dem Verein beigetreten.",
            f"/#club:members?member={user.regular_member_id}&memberName={member.nickname or member.name}",
            category="members",
        )
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "user": _user_dict(user)}

"""Authentication endpoints — login, invite, register."""
import secrets
from datetime import datetime, timedelta, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_current_user
from core.database import get_db
from core.push import push_to_club_admins
from core.security import verify_password, get_password_hash, create_access_token
from models.user import User, UserRole, InviteToken, PasswordResetToken

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
    # Accept email or username in the email field
    user = (db.query(User).filter(User.email == req.email).first()
            or db.query(User).filter(User.username == req.email).first())
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account deactivated")
    token = create_access_token({"sub": str(user.id)})
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
    return {"token": token_val, "reset_url": f"/reset?reset={token_val}"}


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
    return {"ok": True}


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

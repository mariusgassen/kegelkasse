"""Authentication endpoints — login, invite, register."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import Optional
import secrets

from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token
from app.models.user import User, UserRole, InviteToken
from app.models.club import Club
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    token: str
    name: str
    password: str

class UpdateLocaleRequest(BaseModel):
    locale: str  # "de" | "en"

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "user": {"id": user.id, "email": user.email, "name": user.name,
                 "role": user.role, "club_id": user.club_id, "preferred_locale": user.preferred_locale}
    }

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email, "name": current_user.name,
            "role": current_user.role, "club_id": current_user.club_id,
            "preferred_locale": current_user.preferred_locale}

@router.patch("/locale")
def update_locale(req: UpdateLocaleRequest, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    current_user.preferred_locale = req.locale
    db.commit()
    return {"ok": True}

@router.post("/invite")
def create_invite(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Club admin or superadmin can create invites
    from app.api.deps import require_club_admin
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Admin required to create invites")
    token_val = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=7)
    invite = InviteToken(token=token_val, club_id=current_user.club_id,
                         created_by=current_user.id, expires_at=expires)
    db.add(invite); db.commit()
    return {"token": token_val, "expires_at": expires.isoformat(),
            "invite_url": f"/join?token={token_val}"}

@router.post("/register")
def register_with_invite(req: RegisterRequest, db: Session = Depends(get_db)):
    invite = db.query(InviteToken).filter(
        InviteToken.token == req.token,
        InviteToken.used_at == None,
        InviteToken.expires_at > datetime.utcnow()
    ).first()
    if not invite:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")
    user = User(
        email=f"member_{secrets.token_hex(6)}@kegelkasse.internal",
        name=req.name,
        hashed_password=get_password_hash(req.password),
        role=UserRole.member,
        club_id=invite.club_id
    )
    db.add(user); db.flush()
    invite.used_at = datetime.utcnow(); invite.used_by = user.id
    db.commit()
    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token,
            "user": {"id": user.id, "name": user.name, "role": user.role, "club_id": user.club_id}}

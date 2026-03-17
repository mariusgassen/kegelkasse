from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import decode_token
from models.user import User, UserRole

security = HTTPBearer()


def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
) -> User:
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_club_member(user: User = Depends(get_current_user)) -> User:
    """Any authenticated user with a club."""
    if not user.club_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No club assigned")
    return user


def require_club_admin(user: User = Depends(get_current_user)) -> User:
    """Club admin or superadmin required — for club settings, templates, member management."""
    if user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Club admin role required for this action"
        )
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin required")
    return user

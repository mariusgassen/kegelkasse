from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import decode_token
from models.user import User, UserRole
from models.evening import RegularMember

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


def require_committee_or_admin(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
) -> User:
    """Committee member (is_committee=True) or club admin/superadmin required."""
    if user.role in (UserRole.admin, UserRole.superadmin):
        return user
    if not user.regular_member_id or not user.club_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Vergnügungsausschuss or admin required")
    member = db.query(RegularMember).filter(RegularMember.id == user.regular_member_id).first()
    if not member or not member.is_committee:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Vergnügungsausschuss or admin required")
    return user

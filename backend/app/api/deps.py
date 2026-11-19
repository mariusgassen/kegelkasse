from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import decode_token
from models.evening import RegularMember
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
    """Any authenticated user with a club (or superadmin)."""
    if not user.club_id and not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No club assigned")
    return user


def require_club_admin(user: User = Depends(get_current_user)) -> User:
    """Club admin or superadmin required — for club settings, templates, member management."""
    if not user.has_role(UserRole.admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Club admin role required for this action"
        )
    return user


def require_it_admin(user: User = Depends(get_current_user)) -> User:
    """IT admin or superadmin required — for technical settings (SMTP, Telegram, AI, config, tokens)."""
    if not user.has_role(UserRole.it_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="IT admin role required for this action"
        )
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin required")
    return user


def has_club_treasurer(db: Session, club_id: int | None) -> bool:
    """Return True if at least one active user in the club holds the ``treasurer`` role."""
    if not club_id:
        return False
    users = db.query(User).filter(User.club_id == club_id, User.is_active == True).all()  # noqa: E712
    return any(UserRole.treasurer.value in u.all_roles for u in users)


def can_manage_treasury(user: User, db: Session) -> bool:
    """Return True if user is Kassenwart (treasurer/superadmin), or club admin when no treasurer is assigned."""
    if user.has_role(UserRole.treasurer):
        return True
    if user.has_role(UserRole.admin) and not has_club_treasurer(db, user.club_id):
        return True
    return False


def require_treasurer(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
) -> User:
    """Kassenwart (treasurer) required; falls back to club admin while the club has no treasurer assigned."""
    if not can_manage_treasury(user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Kassenwart (treasurer) role required for this action"
        )
    return user


def require_committee_or_admin(user: User = Depends(get_current_user)) -> User:
    """Committee member (role=committee) or club admin/superadmin required."""
    if not user.has_role(UserRole.committee, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Vergnügungsausschuss or admin required")
    return user


def require_zeugwart_or_admin(user: User = Depends(get_current_user)) -> User:
    """Zeugwart (role=zeugwart) or club admin/superadmin required."""
    if not user.has_role(UserRole.zeugwart, UserRole.admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Zeugwart or admin required")
    return user


def toggle_regular_member_role(
    db: Session,
    club_id: int | None,
    mid: int,
    role: UserRole,
    enabled: bool,
) -> RegularMember:
    """Toggle a club role in ``User.roles`` for the user linked to ``RegularMember(id=mid)``."""
    from models.evening import RegularMember
    from models.user import normalize_roles

    member = db.query(RegularMember).filter(
        RegularMember.id == mid, RegularMember.club_id == club_id
    ).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.is_guest and enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Guests cannot have role {role.value}")

    target_user = db.query(User).filter(
        User.club_id == club_id, User.regular_member_id == member.id
    ).first()
    if not target_user and member.user_id:
        target_user = db.query(User).filter(
            User.club_id == club_id, User.id == member.user_id
        ).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member has no linked user account")

    current = set(target_user.all_roles)
    if enabled:
        current.add(role.value)
    else:
        current.discard(role.value)
    target_user.roles = normalize_roles(current)
    db.commit()
    return member


def list_regular_members_with_role(
    db: Session,
    club_id: int | None,
    role: UserRole,
) -> list[dict]:
    """Return active non-guest roster entries whose linked user holds ``role`` in ``User.roles``."""
    from models.evening import RegularMember

    if not club_id:
        return []
    users = db.query(User).filter(User.club_id == club_id, User.is_active == True).all()  # noqa: E712
    rm_ids = {u.regular_member_id for u in users if u.regular_member_id and role.value in u.all_roles}
    user_ids = {u.id for u in users if role.value in u.all_roles}
    if not rm_ids and not user_ids:
        return []
    members = db.query(RegularMember).filter(
        RegularMember.club_id == club_id,
        RegularMember.is_active == True,  # noqa: E712
        RegularMember.is_guest == False,  # noqa: E712
    ).order_by(RegularMember.name).all()
    return [
        {"id": m.id, "name": m.name, "nickname": m.nickname}
        for m in members
        if m.id in rm_ids or (m.user_id and m.user_id in user_ids)
    ]


def ensure_club_retains_admin(
    db: Session,
    target: User,
    new_roles: list[str] | set[str] | None = None,
    will_be_active: bool = True,
) -> None:
    """Ensure every club keeps at least one active user holding the ``admin`` role."""
    if not target.club_id or UserRole.admin.value not in target.all_roles:
        return
    loses_admin = (not will_be_active) or (new_roles is not None and UserRole.admin.value not in new_roles)
    if not loses_admin:
        return
    other_users = db.query(User).filter(
        User.club_id == target.club_id,
        User.id != target.id,
        User.is_active == True,  # noqa: E712
    ).all()
    if not any(UserRole.admin.value in u.all_roles for u in other_users):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Der Verein muss mindestens einen aktiven Admin behalten",
        )



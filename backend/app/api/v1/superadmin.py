"""Superadmin endpoints — cross-club management."""
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from core.schemas import TrimmedModel
from sqlalchemy.orm import Session

from api.deps import require_superadmin, get_db
from core.security import create_access_token
from models.club import Club, ClubSettings, ClubPin
from models.comment import Comment, CommentReaction
from models.committee import ClubAnnouncement, ClubTrip
from models.drink import DrinkRound
from models.evening import (
    ClubTeam, Evening, EveningHighlight, EveningPlayer, RegularMember, Team,
)
from models.game import Game, GameTemplate, GameThrowLog
from models.payment import ClubExpense, MemberPayment, PaymentRequest
from models.penalty import PenaltyLog, PenaltyType
from models.push import NotificationLog, PushSubscription
from models.schedule import MemberRsvp, ScheduledEvening, ScheduledEveningGuest
from models.user import InviteToken, User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get("/clubs")
def list_clubs(db: Session = Depends(get_db), user: User = Depends(require_superadmin)):
    """List all clubs with member count."""
    clubs = db.query(Club).order_by(Club.name).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "member_count": sum(1 for m in c.members if m.is_active),
            "is_active": c.id == user.club_id,
        }
        for c in clubs
    ]


class CreateClubRequest(TrimmedModel):
    name: str


@router.post("/clubs")
def create_club(data: CreateClubRequest, db: Session = Depends(get_db),
                user: User = Depends(require_superadmin)):
    """Create a new club."""
    slug = re.sub(r'[^a-z0-9]+', '-', data.name.lower()).strip('-') or "club"
    base, i = slug, 2
    while db.query(Club).filter(Club.slug == slug).first():
        slug = f"{base}-{i}"
        i += 1
    club = Club(name=data.name, slug=slug)
    db.add(club)
    db.flush()
    db.add(ClubSettings(club_id=club.id))
    db.commit()
    db.refresh(club)
    logger.info("Club created: id=%d name=%r slug=%r by superadmin=%d", club.id, club.name, club.slug, user.id)
    return {"id": club.id, "name": club.name, "slug": club.slug, "member_count": 0, "is_active": False}


class UpdateClubRequest(TrimmedModel):
    name: Optional[str] = None
    slug: Optional[str] = None


@router.patch("/clubs/{club_id}")
def update_club(club_id: int, data: UpdateClubRequest, db: Session = Depends(get_db),
                user: User = Depends(require_superadmin)):
    """Rename a club's display name and/or slug."""
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(404, "Club not found")
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(400, "Name must not be empty")
        club.name = name
    if data.slug is not None:
        slug = data.slug.strip().lower()
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
            raise HTTPException(400, "Slug must be lowercase alphanumeric with hyphens")
        existing = db.query(Club).filter(Club.slug == slug, Club.id != club_id).first()
        if existing:
            raise HTTPException(409, "Slug already in use")
        club.slug = slug
    db.commit()
    db.refresh(club)
    logger.info("Club updated: id=%d name=%r slug=%r by superadmin=%d", club.id, club.name, club.slug, user.id)
    member_count = sum(1 for m in club.members if m.is_active)
    return {"id": club.id, "name": club.name, "slug": club.slug,
            "member_count": member_count, "is_active": club.id == user.club_id}


@router.delete("/clubs/{club_id}", status_code=204)
def delete_club(club_id: int, db: Session = Depends(get_db),
                user: User = Depends(require_superadmin)):
    """Permanently delete a club and all its data. Cannot delete your active club."""
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(404, "Club not found")
    if user.club_id == club_id:
        raise HTTPException(400, "Cannot delete your currently active club. Switch to another club first.")
    club_name = club.name  # capture before deletion expunges the instance

    # Collect IDs needed for deep cascade (bulk deletes don't fire ORM cascades)
    evening_ids = [r[0] for r in db.query(Evening.id).filter(Evening.club_id == club_id)]
    game_ids = [r[0] for r in db.query(Game.id).filter(Game.evening_id.in_(evening_ids))] if evening_ids else []
    highlight_ids = [r[0] for r in db.query(EveningHighlight.id).filter(
        EveningHighlight.evening_id.in_(evening_ids))] if evening_ids else []
    announcement_ids = [r[0] for r in db.query(ClubAnnouncement.id).filter(ClubAnnouncement.club_id == club_id)]
    comment_ids = []
    if highlight_ids:
        comment_ids += [r[0] for r in db.query(Comment.id).filter(
            Comment.parent_type == 'highlight', Comment.parent_id.in_(highlight_ids))]
    if announcement_ids:
        comment_ids += [r[0] for r in db.query(Comment.id).filter(
            Comment.parent_type == 'announcement', Comment.parent_id.in_(announcement_ids))]
    scheduled_ids = [r[0] for r in db.query(ScheduledEvening.id).filter(ScheduledEvening.club_id == club_id)]
    user_ids = [r[0] for r in db.query(User.id).filter(User.club_id == club_id)]

    # Delete leaves first, then parents
    if comment_ids:
        db.query(CommentReaction).filter(CommentReaction.comment_id.in_(comment_ids)).delete(synchronize_session=False)
        db.query(Comment).filter(Comment.id.in_(comment_ids)).delete(synchronize_session=False)
    if game_ids:
        db.query(GameThrowLog).filter(GameThrowLog.game_id.in_(game_ids)).delete(synchronize_session=False)
    if evening_ids:
        db.query(PenaltyLog).filter(PenaltyLog.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(DrinkRound).filter(DrinkRound.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(Game).filter(Game.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(Team).filter(Team.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(EveningHighlight).filter(EveningHighlight.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(Evening).filter(Evening.id.in_(evening_ids)).delete(synchronize_session=False)
    if scheduled_ids:
        db.query(MemberRsvp).filter(MemberRsvp.scheduled_evening_id.in_(scheduled_ids)).delete(synchronize_session=False)
        db.query(ScheduledEveningGuest).filter(
            ScheduledEveningGuest.scheduled_evening_id.in_(scheduled_ids)).delete(synchronize_session=False)
        db.query(ScheduledEvening).filter(ScheduledEvening.id.in_(scheduled_ids)).delete(synchronize_session=False)
    db.query(ClubAnnouncement).filter(ClubAnnouncement.club_id == club_id).delete(synchronize_session=False)
    db.query(ClubTrip).filter(ClubTrip.club_id == club_id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club_id).delete(synchronize_session=False)
    db.query(PaymentRequest).filter(PaymentRequest.club_id == club_id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club_id).delete(synchronize_session=False)
    db.query(InviteToken).filter(InviteToken.club_id == club_id).delete(synchronize_session=False)
    if user_ids:
        db.query(PushSubscription).filter(PushSubscription.user_id.in_(user_ids)).delete(synchronize_session=False)
        db.query(NotificationLog).filter(NotificationLog.user_id.in_(user_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(user_ids)).update(
            {User.club_id: None, User.regular_member_id: None}, synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club_id).delete(synchronize_session=False)
    db.query(PenaltyType).filter(PenaltyType.club_id == club_id).delete(synchronize_session=False)
    db.query(GameTemplate).filter(GameTemplate.club_id == club_id).delete(synchronize_session=False)
    db.query(ClubTeam).filter(ClubTeam.club_id == club_id).delete(synchronize_session=False)
    db.query(ClubPin).filter(ClubPin.club_id == club_id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club_id).delete(synchronize_session=False)
    db.query(Club).filter(Club.id == club_id).delete(synchronize_session=False)
    db.commit()
    logger.warning("Club deleted: id=%d name=%r by superadmin=%d", club_id, club_name, user.id)


@router.post("/switch-club/{club_id}")
def switch_club(club_id: int, db: Session = Depends(get_db),
                user: User = Depends(require_superadmin)):
    """Switch the superadmin's active club context. Returns a new token."""
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(404, "Club not found")
    user.club_id = club_id
    db.commit()
    logger.info("Superadmin %d switched to club %d (%r)", user.id, club_id, club.name)
    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "user": {
            "id": user.id, "email": user.email, "name": user.name,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "roles": sorted(list(user.all_roles)),
            "club_id": user.club_id,
            "preferred_locale": user.preferred_locale,
        }
    }


class UpdateUserRoleRequest(TrimmedModel):
    role: str


class UpdateUserRolesRequest(TrimmedModel):
    roles: list[str]


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    user: User = Depends(require_superadmin),
):
    """List all users with their club and roles for global role administration."""
    users = db.query(User).order_by(User.name).all()
    clubs = {c.id: c.name for c in db.query(Club).all()}
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role),
            "roles": sorted(list(u.all_roles)),
            "club_id": u.club_id,
            "club_name": clubs.get(u.club_id) if u.club_id else None,
            "is_active": u.is_active,
        }
        for u in users
    ]


def _apply_user_roles(
    db: Session,
    current_user: User,
    target_user: User,
    new_roles: list[str],
) -> dict:
    allowed_roles = {r.value for r in UserRole}
    for r in new_roles:
        if r not in allowed_roles:
            raise HTTPException(400, f"Invalid role: {r}. Allowed: {sorted(allowed_roles)}")

    normalized_roles = list({r for r in new_roles if r in allowed_roles})
    if not normalized_roles:
        normalized_roles = [UserRole.member.value]

    # Safety: Cannot demote yourself if you are the only active superadmin
    if target_user.id == current_user.id and UserRole.superadmin.value not in normalized_roles:
        active_users = db.query(User).filter(User.is_active == True).all()  # noqa: E712
        superadmin_count = sum(1 for u in active_users if u.is_superadmin)
        if superadmin_count <= 1:
            raise HTTPException(400, "Cannot demote the only active superadmin")

    target_user.roles = sorted(normalized_roles)
    # Sync primary role column for backward compatibility
    if UserRole.superadmin.value in normalized_roles:
        target_user.role = UserRole.superadmin
    elif UserRole.admin.value in normalized_roles:
        target_user.role = UserRole.admin
    elif UserRole.product_manager.value in normalized_roles:
        target_user.role = UserRole.product_manager
    else:
        target_user.role = UserRole.member

    db.commit()
    db.refresh(target_user)
    logger.info(
        "User roles updated: user_id=%d roles=%r primary_role=%r by superadmin=%d",
        target_user.id, target_user.roles, target_user.role.value, current_user.id,
    )
    return {
        "id": target_user.id,
        "name": target_user.name,
        "email": target_user.email,
        "role": target_user.role.value if hasattr(target_user.role, "value") else str(target_user.role),
        "roles": sorted(list(target_user.all_roles)),
    }


@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    data: UpdateUserRoleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    """Assign a single role to a user (backwards compatible)."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(404, "User not found")
    return _apply_user_roles(db, current_user, target_user, [data.role])


@router.patch("/users/{user_id}/roles")
def update_user_roles(
    user_id: int,
    data: UpdateUserRolesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
):
    """Assign multiple roles to a user (e.g. ['admin', 'product_manager'])."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(404, "User not found")
    return _apply_user_roles(db, current_user, target_user, data.roles)


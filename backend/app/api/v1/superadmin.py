"""Superadmin endpoints — cross-club management."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_superadmin, get_db
from core.security import create_access_token
from models.club import Club, ClubSettings
from models.user import User

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


class CreateClubRequest(BaseModel):
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
    return {"id": club.id, "name": club.name, "slug": club.slug, "member_count": 0, "is_active": False}


@router.post("/switch-club/{club_id}")
def switch_club(club_id: int, db: Session = Depends(get_db),
                user: User = Depends(require_superadmin)):
    """Switch the superadmin's active club context. Returns a new token."""
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(404, "Club not found")
    user.club_id = club_id
    db.commit()
    token = create_access_token({"sub": str(user.id)})
    return {
        "access_token": token,
        "user": {
            "id": user.id, "email": user.email, "name": user.name,
            "role": user.role, "club_id": user.club_id,
            "preferred_locale": user.preferred_locale,
        }
    }

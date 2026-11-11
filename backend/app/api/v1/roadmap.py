"""Community-driven roadmap — propose, discuss and vote on Kegelkasse 2.0 features."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from api.deps import get_current_user
from api.v1.audit import _display_name, _is_admin
from core.database import get_db
from core.schemas import TrimmedModel
from models.roadmap import RoadmapItem, RoadmapVote
from models.user import User, UserRole

router = APIRouter(prefix="/roadmap", tags=["roadmap"])

ALLOWED_STATUSES = {"idea", "planned", "in_progress", "completed", "rejected"}
ALLOWED_CATEGORIES = {"feature", "improvement", "design", "bug", "general"}


class RoadmapItemCreate(TrimmedModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = "feature"


class RoadmapItemUpdate(TrimmedModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    target_version: Optional[str] = None


def _serialize_item(item: RoadmapItem, vote_count: int, has_voted: bool) -> dict:
    return {
        "id": item.id,
        "club_id": item.club_id,
        "created_by_user_id": item.created_by_user_id,
        "author_name": item.author_name or ("Kegelkasse Team" if item.is_official else "Mitglied"),
        "title": item.title,
        "description": item.description,
        "status": item.status,
        "category": item.category,
        "target_version": item.target_version,
        "is_official": item.is_official,
        "vote_count": vote_count,
        "has_voted": has_voted,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@router.get("", response_model=List[dict])
def list_roadmap(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List roadmap items for the current user and their club (or global items)."""
    clauses = [RoadmapItem.club_id.is_(None)]
    if user.club_id:
        clauses.append(RoadmapItem.club_id == user.club_id)
    elif user.role == UserRole.superadmin:
        clauses = [True]

    query = db.query(RoadmapItem).filter(or_(*clauses))

    if status_filter:
        query = query.filter(RoadmapItem.status == status_filter)

    items = query.all()

    item_ids = [it.id for it in items]
    vote_counts = {}
    user_voted_set = set()

    if item_ids:
        counts = (
            db.query(RoadmapVote.item_id, func.count(RoadmapVote.id))
            .filter(RoadmapVote.item_id.in_(item_ids))
            .group_by(RoadmapVote.item_id)
            .all()
        )
        vote_counts = {item_id: cnt for item_id, cnt in counts}

        my_votes = (
            db.query(RoadmapVote.item_id)
            .filter(RoadmapVote.item_id.in_(item_ids), RoadmapVote.user_id == user.id)
            .all()
        )
        user_voted_set = {v[0] for v in my_votes}

    result = [
        _serialize_item(
            it,
            vote_count=vote_counts.get(it.id, 0),
            has_voted=it.id in user_voted_set,
        )
        for it in items
    ]

    result.sort(key=lambda x: (not x["is_official"], -x["vote_count"], -x["id"]))
    return result


@router.post("/items", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_roadmap_item(
    payload: RoadmapItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Propose a new idea for the community roadmap."""
    if not payload.title or len(payload.title.strip()) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Title must be at least 2 characters")
    if len(payload.title) > 200:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Title too long (max 200)")

    category = payload.category or "feature"
    if category not in ALLOWED_CATEGORIES:
        category = "feature"

    author = _display_name(db, user) if user.club_id else user.name

    item = RoadmapItem(
        club_id=user.club_id,
        created_by_user_id=user.id,
        author_name=author,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        status="idea",
        category=category,
        is_official=False,
    )
    db.add(item)
    db.flush()

    vote = RoadmapVote(item_id=item.id, user_id=user.id)
    db.add(vote)
    db.commit()
    db.refresh(item)

    return _serialize_item(item, vote_count=1, has_voted=True)


@router.post("/items/{item_id}/vote", response_model=dict)
def toggle_vote(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Toggle the current user's upvote on a roadmap item."""
    item = db.query(RoadmapItem).filter(RoadmapItem.id == item_id).first()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roadmap item not found")

    if item.club_id is not None and item.club_id != user.club_id and user.role != UserRole.superadmin:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roadmap item not found")

    existing_vote = (
        db.query(RoadmapVote)
        .filter(RoadmapVote.item_id == item_id, RoadmapVote.user_id == user.id)
        .first()
    )

    if existing_vote:
        db.delete(existing_vote)
        has_voted = False
    else:
        new_vote = RoadmapVote(item_id=item_id, user_id=user.id)
        db.add(new_vote)
        has_voted = True

    db.commit()

    count = db.query(RoadmapVote).filter(RoadmapVote.item_id == item_id).count()
    return {"item_id": item_id, "has_voted": has_voted, "vote_count": count}


@router.patch("/items/{item_id}", response_model=dict)
def update_roadmap_item(
    item_id: int,
    payload: RoadmapItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a roadmap item. Admins can change status/target_version; creators can edit text."""
    item = db.query(RoadmapItem).filter(RoadmapItem.id == item_id).first()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roadmap item not found")

    is_super = user.role == UserRole.superadmin
    is_club_adm = _is_admin(user) and user.club_id == item.club_id
    is_author = item.created_by_user_id == user.id

    if not (is_super or is_club_adm or is_author):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to edit this item")

    if payload.status is not None:
        if not (is_super or is_club_adm):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can change item status")
        if payload.status not in ALLOWED_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid status: {payload.status}")
        item.status = payload.status

    if payload.target_version is not None:
        if not (is_super or is_club_adm):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can set target version")
        item.target_version = payload.target_version.strip() if payload.target_version else None

    if payload.title is not None:
        if len(payload.title.strip()) < 2:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Title must be at least 2 characters")
        item.title = payload.title.strip()

    if payload.description is not None:
        item.description = payload.description.strip() if payload.description else None

    if payload.category is not None:
        if payload.category in ALLOWED_CATEGORIES:
            item.category = payload.category

    db.commit()
    db.refresh(item)

    count = db.query(RoadmapVote).filter(RoadmapVote.item_id == item.id).count()
    has_voted = (
        db.query(RoadmapVote)
        .filter(RoadmapVote.item_id == item.id, RoadmapVote.user_id == user.id)
        .first()
        is not None
    )
    return _serialize_item(item, vote_count=count, has_voted=has_voted)


@router.delete("/items/{item_id}", response_model=dict)
def delete_roadmap_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a roadmap item."""
    item = db.query(RoadmapItem).filter(RoadmapItem.id == item_id).first()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roadmap item not found")

    is_super = user.role == UserRole.superadmin
    is_club_adm = _is_admin(user) and user.club_id == item.club_id
    is_author = item.created_by_user_id == user.id and item.status == "idea"

    if item.is_official and not is_super:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Official items can only be deleted by superadmin")

    if not (is_super or is_club_adm or is_author):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to delete this item")

    db.delete(item)
    db.commit()
    return {"ok": True, "id": item_id}

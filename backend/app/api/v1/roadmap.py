"""Community-driven roadmap — propose, discuss and vote on Kegelkasse features."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from api.deps import get_current_user
from api.v1.audit import _display_name, _is_admin
from core.database import get_db
from core.schemas import TrimmedModel
from models.comment import Comment
from models.roadmap import RoadmapItem, RoadmapVote
from models.user import User, UserRole

router = APIRouter(prefix="/roadmap", tags=["roadmap"])

ALLOWED_STATUSES = {"idea", "planned", "in_progress", "completed", "rejected", "duplicate"}


class RoadmapItemCreate(TrimmedModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = "feature"
    tags: Optional[str] = None


class RoadmapItemUpdate(TrimmedModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    is_pinned: Optional[bool] = None
    duplicate_of_id: Optional[int] = None
    admin_notes: Optional[str] = None
    target_version: Optional[str] = None


def _parse_tags(tags_str: Optional[str]) -> List[str]:
    if not tags_str:
        return []
    return [t.strip() for t in tags_str.split(",") if t.strip()]


def _serialize_item(
    item: RoadmapItem,
    vote_count: int,
    has_voted: bool,
    duplicate_of_title: Optional[str] = None,
    comment_count: int = 0,
) -> dict:
    return {
        "id": item.id,
        "club_id": item.club_id,
        "created_by_user_id": item.created_by_user_id,
        "author_name": item.author_name or ("Kegelkasse Team" if item.is_official else "Mitglied"),
        "title": item.title,
        "description": item.description,
        "status": item.status,
        "category": item.category or "feature",
        "tags": _parse_tags(item.tags),
        "tags_raw": item.tags or "",
        "is_pinned": bool(item.is_pinned),
        "duplicate_of_id": item.duplicate_of_id,
        "duplicate_of_title": duplicate_of_title,
        "admin_notes": item.admin_notes,
        "target_version": item.target_version,
        "is_official": item.is_official,
        "vote_count": vote_count,
        "has_voted": has_voted,
        "comment_count": comment_count,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@router.get("", response_model=List[dict])
def list_roadmap(
    status_filter: Optional[str] = Query(None, alias="status"),
    category_filter: Optional[str] = Query(None, alias="category"),
    tag_filter: Optional[str] = Query(None, alias="tag"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List roadmap items for the current user and their club (or global items)."""
    if user.has_role(UserRole.product_manager):
        clauses = [True]
    elif user.club_id:
        clauses = [RoadmapItem.club_id.is_(None), RoadmapItem.club_id == user.club_id]
    else:
        clauses = [RoadmapItem.club_id.is_(None)]

    query = db.query(RoadmapItem).filter(or_(*clauses))

    if status_filter:
        query = query.filter(RoadmapItem.status == status_filter)
    if category_filter:
        query = query.filter(RoadmapItem.category == category_filter)
    if tag_filter:
        query = query.filter(RoadmapItem.tags.ilike(f"%{tag_filter}%"))

    items = query.all()

    item_ids = [it.id for it in items]
    vote_counts = {}
    user_voted_set = set()
    comment_counts = {}

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

        c_counts = (
            db.query(Comment.parent_id, func.count(Comment.id))
            .filter(
                Comment.parent_type == "roadmap",
                Comment.parent_id.in_(item_ids),
                Comment.is_deleted == False,  # noqa: E712
            )
            .group_by(Comment.parent_id)
            .all()
        )
        comment_counts = {p_id: cnt for p_id, cnt in c_counts}

    # Map duplicate_of titles
    duplicate_ids = [it.duplicate_of_id for it in items if it.duplicate_of_id]
    duplicate_titles = {}
    if duplicate_ids:
        targets = db.query(RoadmapItem.id, RoadmapItem.title).filter(RoadmapItem.id.in_(duplicate_ids)).all()
        duplicate_titles = {t[0]: t[1] for t in targets}

    result = [
        _serialize_item(
            it,
            vote_count=vote_counts.get(it.id, 0),
            has_voted=it.id in user_voted_set,
            duplicate_of_title=duplicate_titles.get(it.duplicate_of_id) if it.duplicate_of_id else None,
            comment_count=comment_counts.get(it.id, 0),
        )
        for it in items
    ]

    # Sort: pinned first, then official, then vote_count descending, then id descending
    result.sort(key=lambda x: (not x["is_pinned"], not x["is_official"], -x["vote_count"], -x["id"]))
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

    category = payload.category.strip() if payload.category else "feature"
    author = _display_name(db, user) if user.club_id else user.name

    item = RoadmapItem(
        club_id=user.club_id,
        created_by_user_id=user.id,
        author_name=author,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        status="idea",
        category=category,
        tags=payload.tags.strip() if payload.tags else None,
        is_pinned=False,
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

    if item.club_id is not None and item.club_id != user.club_id and not user.is_superadmin:
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
    """Update a roadmap item. Admins can move status, tag, pin, mark duplicate, and manage categories."""
    item = db.query(RoadmapItem).filter(RoadmapItem.id == item_id).first()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roadmap item not found")

    is_lead = user.has_role(UserRole.product_manager)
    is_club_adm = _is_admin(user) and (item.club_id is None or user.club_id == item.club_id)
    is_author = item.created_by_user_id == user.id
    can_manage = is_lead or is_club_adm

    if not (can_manage or is_author):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to edit this item")

    # Status changes
    if payload.status is not None:
        if not can_manage:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins and product managers can move item status")
        if payload.status not in ALLOWED_STATUSES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid status: {payload.status}")
        item.status = payload.status

    # Pinning / Marking
    if payload.is_pinned is not None:
        if not can_manage:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins and product managers can pin/mark items")
        item.is_pinned = payload.is_pinned

    # Duplicate marking
    if payload.duplicate_of_id is not None:
        if not can_manage:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins and product managers can mark duplicates")
        if payload.duplicate_of_id == item.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An item cannot be a duplicate of itself")
        if payload.duplicate_of_id > 0:
            target = db.query(RoadmapItem).filter(RoadmapItem.id == payload.duplicate_of_id).first()
            if not target:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Target duplicate item not found")
            item.duplicate_of_id = payload.duplicate_of_id
            item.status = "duplicate"
        else:
            item.duplicate_of_id = None

    # Admin notes
    if payload.admin_notes is not None:
        if not can_manage:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins and product managers can add admin notes")
        item.admin_notes = payload.admin_notes.strip() if payload.admin_notes else None

    # Target version
    if payload.target_version is not None:
        if not can_manage:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins and product managers can set target version")
        item.target_version = payload.target_version.strip() if payload.target_version else None

    # Category management (admins and product managers can assign or rename category)
    if payload.category is not None:
        if not (can_manage or is_author):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to change category")
        item.category = payload.category.strip() if payload.category else "feature"

    # Tags management
    if payload.tags is not None:
        if not (can_manage or is_author):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to change tags")
        item.tags = payload.tags.strip() if payload.tags else None

    # Title & Description
    if payload.title is not None:
        if len(payload.title.strip()) < 2:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Title must be at least 2 characters")
        item.title = payload.title.strip()

    if payload.description is not None:
        item.description = payload.description.strip() if payload.description else None

    db.commit()
    db.refresh(item)

    count = db.query(RoadmapVote).filter(RoadmapVote.item_id == item.id).count()
    has_voted = (
        db.query(RoadmapVote)
        .filter(RoadmapVote.item_id == item.id, RoadmapVote.user_id == user.id)
        .first()
        is not None
    )

    comment_count = (
        db.query(Comment)
        .filter(Comment.parent_type == "roadmap", Comment.parent_id == item.id, Comment.is_deleted == False)  # noqa: E712
        .count()
    )

    duplicate_title = None
    if item.duplicate_of_id:
        target = db.query(RoadmapItem.title).filter(RoadmapItem.id == item.duplicate_of_id).first()
        duplicate_title = target[0] if target else None

    return _serialize_item(
        item,
        vote_count=count,
        has_voted=has_voted,
        duplicate_of_title=duplicate_title,
        comment_count=comment_count,
    )


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

    is_lead = user.has_role(UserRole.product_manager)
    is_club_adm = _is_admin(user) and (item.club_id is None or user.club_id == item.club_id)
    is_author = item.created_by_user_id == user.id and item.status == "idea"

    if item.is_official and not is_lead:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Official items can only be deleted by superadmins or product managers")

    if not (is_lead or is_club_adm or is_author):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to delete this item")

    db.delete(item)
    db.commit()
    return {"ok": True, "id": item_id}

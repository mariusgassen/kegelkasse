"""Community-driven roadmap — propose, discuss and vote on Kegelkasse features."""
from typing import List, Optional

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.deps import get_current_user
from api.v1.audit import _display_name, _is_admin
from core.database import get_db
from core.push import push_to_user
from core.ratelimit import SlidingWindowLimiter
from core.schemas import TrimmedModel
from models.comment import Comment, ItemReaction
from models.roadmap import RoadmapItem, RoadmapVote
from models.user import User, UserRole

router = APIRouter(prefix="/roadmap", tags=["roadmap"])

logger = logging.getLogger(__name__)

ALLOWED_STATUSES = {"idea", "planned", "in_progress", "completed", "rejected", "duplicate"}
# Members can still vote on / edit an idea only while it is a plain idea or on the plan.
VOTE_CLOSED_STATUSES = {"rejected", "duplicate"}

MAX_TITLE = 200
MAX_DESCRIPTION = 4000
MAX_NOTES = 2000
MAX_CATEGORY = 50
MAX_TAG_COUNT = 8
MAX_TAG_LENGTH = 30
MAX_VERSION = 20
MAX_PAGE = 500
DEFAULT_PAGE = 200

# New ideas per user per hour (per-process, like the other public-ish limiters).
_create_limiter = SlidingWindowLimiter(3600)
CREATE_LIMIT_PER_HOUR = 10

_STATUS_LABEL_DE = {
    "idea": "Ideenpool", "planned": "Geplant", "in_progress": "In Arbeit",
    "completed": "Abgeschlossen", "rejected": "Verworfen", "duplicate": "Duplikat",
}


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


def _bad(msg: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, msg)


def _clean_tags(raw: Optional[str]) -> Optional[str]:
    """Normalize a comma separated tag string: trimmed, de-duplicated, bounded."""
    if not raw:
        return None
    seen: list[str] = []
    for tag in (t.strip().lstrip("#") for t in raw.split(",")):
        if tag and tag.lower() not in {x.lower() for x in seen}:
            seen.append(tag)
    if len(seen) > MAX_TAG_COUNT:
        raise _bad(f"Too many tags (max {MAX_TAG_COUNT})")
    if any(len(t) > MAX_TAG_LENGTH for t in seen):
        raise _bad(f"Tag too long (max {MAX_TAG_LENGTH})")
    return ", ".join(seen) or None


def _clean_category(raw: Optional[str]) -> str:
    cat = (raw or "").strip() or "feature"
    if len(cat) > MAX_CATEGORY:
        raise _bad(f"Category too long (max {MAX_CATEGORY})")
    return cat


def _clean_text(raw: Optional[str], limit: int, field: str) -> Optional[str]:
    text = (raw or "").strip()
    if len(text) > limit:
        raise _bad(f"{field} too long (max {limit})")
    return text or None


def _can_see(item: RoadmapItem, user: User) -> bool:
    """The roadmap is global: every club sees every idea so requests are not filed twice."""
    return True


def _can_manage(item: RoadmapItem, user: User) -> bool:
    """Product managers and superadmins manage everything; club admins only their club's ideas.

    Official (global) items have no club, so a club admin must never match them.
    """
    if user.has_role(UserRole.product_manager):
        return True
    return item.club_id is not None and item.club_id == user.club_id and _is_admin(user)


def _vote_counts(db: Session, items: List[RoadmapItem]) -> dict:
    """Distinct voters per item. A main item also counts the voters of its duplicates."""
    ids = [it.id for it in items]
    if not ids:
        return {}
    dup_main = dict(
        db.query(RoadmapItem.id, RoadmapItem.duplicate_of_id)
        .filter(RoadmapItem.duplicate_of_id.in_(ids))
        .all()
    )
    voters: dict[int, set] = {item_id: set() for item_id in ids}
    rows = db.query(RoadmapVote.item_id, RoadmapVote.user_id).filter(
        RoadmapVote.item_id.in_(ids + list(dup_main))
    ).all()
    for item_id, user_id in rows:
        if item_id in voters:
            voters[item_id].add(user_id)
        main_id = dup_main.get(item_id)
        if main_id in voters:
            voters[main_id].add(user_id)
    return {item_id: len(u) for item_id, u in voters.items()}


def _notify_author(db: Session, item: RoadmapItem, actor: User, title: str, body: str) -> None:
    """Tell the idea's author about a moderation change; never fail the request over it."""
    if not item.created_by_user_id or item.created_by_user_id == actor.id:
        return
    try:
        push_to_user(db, item.created_by_user_id, title, body, f"/#roadmap?item={item.id}", category="roadmap")
    except Exception:  # noqa: BLE001
        logger.exception("Roadmap notification failed for item %s", item.id)


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
    limit: int = Query(DEFAULT_PAGE, ge=1, le=MAX_PAGE),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List roadmap items. The roadmap is global: all clubs see all ideas (managing stays per club)."""
    query = db.query(RoadmapItem)

    if status_filter:
        query = query.filter(RoadmapItem.status == status_filter)
    if category_filter:
        query = query.filter(RoadmapItem.category == category_filter)
    if tag_filter:
        # Cheap SQL prefilter, then an exact tag match ("ui" must not find "build").
        query = query.filter(RoadmapItem.tags.ilike(f"%{tag_filter}%"))

    items = query.all()
    if tag_filter:
        wanted = tag_filter.strip().lstrip("#").lower()
        items = [it for it in items if wanted in {t.lower() for t in _parse_tags(it.tags)}]

    item_ids = [it.id for it in items]
    vote_counts = _vote_counts(db, items)
    user_voted_set = set()
    comment_counts = {}

    if item_ids:
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

    # Only reveal a duplicate target's title if the viewer may see that item.
    duplicate_ids = [it.duplicate_of_id for it in items if it.duplicate_of_id]
    duplicate_titles = {}
    if duplicate_ids:
        targets = db.query(RoadmapItem).filter(RoadmapItem.id.in_(duplicate_ids)).all()
        duplicate_titles = {t.id: t.title for t in targets if _can_see(t, user)}

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
    return result[offset:offset + limit]


def _full_item(db: Session, item: RoadmapItem, user: User) -> dict:
    """Serialize one item with its vote/comment counts and duplicate title."""
    has_voted = (
        db.query(RoadmapVote.id)
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
        target = db.query(RoadmapItem).filter(RoadmapItem.id == item.duplicate_of_id).first()
        if target and _can_see(target, user):
            duplicate_title = target.title
    return _serialize_item(
        item,
        vote_count=_vote_counts(db, [item]).get(item.id, 0),
        has_voted=has_voted,
        duplicate_of_title=duplicate_title,
        comment_count=comment_count,
    )


@router.post("/items", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_roadmap_item(
    payload: RoadmapItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Propose a new idea for the community roadmap."""
    title = (payload.title or "").strip()
    if len(title) < 2:
        raise _bad("Title must be at least 2 characters")
    if len(title) > MAX_TITLE:
        raise _bad(f"Title too long (max {MAX_TITLE})")
    description = _clean_text(payload.description, MAX_DESCRIPTION, "Description")
    category = _clean_category(payload.category)
    tags = _clean_tags(payload.tags)

    if _create_limiter.hit(f"user:{user.id}", CREATE_LIMIT_PER_HOUR):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many ideas, try again later")

    author = _display_name(db, user) if user.club_id else user.name

    item = RoadmapItem(
        club_id=user.club_id,
        created_by_user_id=user.id,
        author_name=author,
        title=title,
        description=description,
        status="idea",
        category=category,
        tags=tags,
        is_pinned=False,
        is_official=False,
    )
    db.add(item)
    db.flush()

    db.add(RoadmapVote(item_id=item.id, user_id=user.id))
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
    if not item or not _can_see(item, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roadmap item not found")

    existing_vote = (
        db.query(RoadmapVote)
        .filter(RoadmapVote.item_id == item_id, RoadmapVote.user_id == user.id)
        .first()
    )

    if existing_vote:
        db.delete(existing_vote)
        has_voted = False
        db.commit()
    else:
        if item.status in VOTE_CLOSED_STATUSES:
            raise _bad("Voting is closed for this item")
        db.add(RoadmapVote(item_id=item_id, user_id=user.id))
        has_voted = True
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request (double tap) already stored this vote.
            db.rollback()

    return {
        "item_id": item_id,
        "has_voted": has_voted,
        "vote_count": _vote_counts(db, [item]).get(item_id, 0),
    }


def _would_loop(db: Session, item_id: int, target_id: int) -> bool:
    """True if pointing ``item_id`` at ``target_id`` would create a duplicate cycle."""
    seen = set()
    current: Optional[int] = target_id
    while current is not None and current not in seen:
        if current == item_id:
            return True
        seen.add(current)
        row = db.query(RoadmapItem.duplicate_of_id).filter(RoadmapItem.id == current).first()
        current = row[0] if row else None
    return False


@router.patch("/items/{item_id}", response_model=dict)
def update_roadmap_item(
    item_id: int,
    payload: RoadmapItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a roadmap item. Admins can move status, tag, pin, mark duplicate, and manage categories."""
    item = db.query(RoadmapItem).filter(RoadmapItem.id == item_id).first()
    if not item or not _can_see(item, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roadmap item not found")

    can_manage = _can_manage(item, user)
    is_author = item.created_by_user_id == user.id

    if not (can_manage or is_author):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to edit this item")

    manager_fields = (
        ("status", "move item status"),
        ("is_pinned", "pin/mark items"),
        ("duplicate_of_id", "mark duplicates"),
        ("admin_notes", "add admin notes"),
        ("target_version", "set target version"),
    )
    if not can_manage:
        for field, what in manager_fields:
            if getattr(payload, field) is not None:
                raise HTTPException(status.HTTP_403_FORBIDDEN, f"Only admins and product managers can {what}")
        # Authors may refine their idea only while it is still a plain idea.
        if item.status != "idea":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This idea is already being handled and can no longer be edited")

    old_status = item.status
    old_notes = item.admin_notes

    # Validate everything before touching the object (a rejected request must not leave a dirty session).
    new_title = None
    if payload.title is not None:
        new_title = payload.title.strip()
        if len(new_title) < 2:
            raise _bad("Title must be at least 2 characters")
        if len(new_title) > MAX_TITLE:
            raise _bad(f"Title too long (max {MAX_TITLE})")
    new_description = _clean_text(payload.description, MAX_DESCRIPTION, "Description") if payload.description is not None else None
    new_category = _clean_category(payload.category) if payload.category is not None else None
    new_tags = _clean_tags(payload.tags) if payload.tags is not None else None
    new_notes = _clean_text(payload.admin_notes, MAX_NOTES, "Admin notes") if payload.admin_notes is not None else None
    new_version = _clean_text(payload.target_version, MAX_VERSION, "Target version") if payload.target_version is not None else None
    if payload.status is not None and payload.status not in ALLOWED_STATUSES:
        raise _bad(f"Invalid status: {payload.status}")

    if payload.duplicate_of_id is not None and payload.duplicate_of_id > 0:
        if payload.duplicate_of_id == item.id:
            raise _bad("An item cannot be a duplicate of itself")
        target = db.query(RoadmapItem).filter(RoadmapItem.id == payload.duplicate_of_id).first()
        if not target or not _can_see(target, user):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Target duplicate item not found")
        if _would_loop(db, item.id, target.id):
            raise _bad("Duplicate chain would form a loop")

    if payload.status is not None:
        item.status = payload.status
        if payload.status != "duplicate" and payload.duplicate_of_id is None:
            # Leaving the duplicate state drops the stale link.
            item.duplicate_of_id = None
    if payload.is_pinned is not None:
        item.is_pinned = payload.is_pinned
    if payload.duplicate_of_id is not None:
        if payload.duplicate_of_id > 0:
            item.duplicate_of_id = payload.duplicate_of_id
            item.status = "duplicate"
        else:
            item.duplicate_of_id = None
    if payload.admin_notes is not None:
        item.admin_notes = new_notes
    if payload.target_version is not None:
        item.target_version = new_version
    if new_category is not None:
        item.category = new_category
    if payload.tags is not None:
        item.tags = new_tags
    if new_title is not None:
        item.title = new_title
    if payload.description is not None:
        item.description = new_description

    db.commit()
    db.refresh(item)

    if item.status != old_status:
        _notify_author(
            db, item, user,
            "Deine Roadmap-Idee",
            f"„{item.title}“ ist jetzt: {_STATUS_LABEL_DE.get(item.status, item.status)}",
        )
    elif item.admin_notes and item.admin_notes != old_notes:
        _notify_author(db, item, user, "Notiz zu deiner Roadmap-Idee", f"Neue Notiz zu „{item.title}“")

    return _full_item(db, item, user)


@router.delete("/items/{item_id}", response_model=dict)
def delete_roadmap_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a roadmap item together with its comments and reactions."""
    item = db.query(RoadmapItem).filter(RoadmapItem.id == item_id).first()
    if not item or not _can_see(item, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Roadmap item not found")

    is_lead = user.has_role(UserRole.product_manager)
    is_author = item.created_by_user_id == user.id and item.status == "idea"

    if item.is_official and not is_lead:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Official items can only be deleted by superadmins or product managers")

    if not (_can_manage(item, user) or is_author):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed to delete this item")

    # Comments / reactions point at the item by (parent_type, parent_id), not by foreign key.
    db.query(Comment).filter(Comment.parent_type == "roadmap", Comment.parent_id == item_id).delete(synchronize_session=False)
    db.query(ItemReaction).filter(ItemReaction.parent_type == "roadmap", ItemReaction.parent_id == item_id).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    return {"ok": True, "id": item_id}

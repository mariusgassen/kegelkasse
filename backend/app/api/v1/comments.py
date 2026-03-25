"""Comments and emoji reactions on highlights and announcements."""
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from core.push import push_to_user
from models.comment import Comment, CommentReaction
from models.committee import ClubAnnouncement
from models.evening import EveningHighlight, Evening
from models.user import User, UserRole
from models.evening import RegularMember

router = APIRouter(prefix="/comments", tags=["comments"])

VALID_PARENT_TYPES = {'highlight', 'announcement'}


def _creator_name(user_id: Optional[int], db: Session) -> Optional[str]:
    if not user_id:
        return None
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        return None
    if u.regular_member_id:
        rm = db.query(RegularMember).filter(RegularMember.id == u.regular_member_id).first()
        if rm:
            return rm.nickname or rm.name
    return u.name


def _serialize_comment(c: Comment, db: Session, current_user_id: int) -> dict:
    reactions_raw = db.query(CommentReaction).filter(CommentReaction.comment_id == c.id).all()
    reaction_map: dict[str, list[int]] = {}
    for r in reactions_raw:
        reaction_map.setdefault(r.emoji, []).append(r.user_id)
    return {
        "id": c.id,
        "text": c.text,
        "created_by_id": c.created_by,
        "created_by_name": _creator_name(c.created_by, db),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "reactions": [
            {"emoji": e, "count": len(uids), "reacted_by_me": current_user_id in uids}
            for e, uids in reaction_map.items()
        ],
    }


def _parent_creator_user_id(parent_type: str, parent_id: int, db: Session) -> Optional[int]:
    """Return the user_id of the person who created the parent item."""
    if parent_type == 'announcement':
        item = db.query(ClubAnnouncement).filter(ClubAnnouncement.id == parent_id).first()
        return item.created_by if item else None
    if parent_type == 'highlight':
        h = db.query(EveningHighlight).filter(EveningHighlight.id == parent_id).first()
        return h.created_by if h else None
    return None



def _assert_parent_access(parent_type: str, parent_id: int, user: User, db: Session) -> None:
    """Raise 404 if the parent item doesn't exist or doesn't belong to the user's club."""
    if parent_type == 'announcement':
        item = db.query(ClubAnnouncement).filter(
            ClubAnnouncement.id == parent_id,
            ClubAnnouncement.club_id == user.club_id,
            ClubAnnouncement.is_deleted == False,  # noqa: E712
        ).first()
        if not item:
            raise HTTPException(404, "Announcement not found")
    elif parent_type == 'highlight':
        h = db.query(EveningHighlight).filter(EveningHighlight.id == parent_id).first()
        if not h:
            raise HTTPException(404, "Highlight not found")
        evening = db.query(Evening).filter(Evening.id == h.evening_id).first()
        if not evening or evening.club_id != user.club_id:
            raise HTTPException(404, "Highlight not found")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{parent_type}/{parent_id}")
def list_comments(
    parent_type: str,
    parent_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    if parent_type not in VALID_PARENT_TYPES:
        raise HTTPException(400, "Invalid parent_type")
    _assert_parent_access(parent_type, parent_id, user, db)
    comments = db.query(Comment).filter(
        Comment.parent_type == parent_type,
        Comment.parent_id == parent_id,
        Comment.is_deleted == False,  # noqa: E712
    ).order_by(Comment.created_at).all()
    return [_serialize_comment(c, db, user.id) for c in comments]


class CommentCreate(BaseModel):
    text: str


def _notify_thread_participants(
    db: Session,
    parent_type: str,
    parent_id: int,
    commenter_user_id: int,
    commenter_name: str,
    comment_text: str,
) -> None:
    """Push a notification to everyone already in the thread (excluding the commenter)."""
    # Collect unique user IDs to notify: parent creator + previous commenters
    notify_ids: set[int] = set()
    creator_id = _parent_creator_user_id(parent_type, parent_id, db)
    if creator_id and creator_id != commenter_user_id:
        notify_ids.add(creator_id)
    prev_commenters = db.query(Comment.created_by).filter(
        Comment.parent_type == parent_type,
        Comment.parent_id == parent_id,
        Comment.is_deleted == False,  # noqa: E712
        Comment.created_by != None,  # noqa: E711
        Comment.created_by != commenter_user_id,
    ).distinct().all()
    for (uid,) in prev_commenters:
        if uid:
            notify_ids.add(uid)
    if not notify_ids:
        return
    parent_anchor = "committee" if parent_type == "announcement" else "evening"
    url = f"/#/{parent_anchor}"
    title = f"💬 {commenter_name}"
    body = comment_text[:120]
    for uid in notify_ids:
        push_to_user(db, uid, title, body, url)


@router.post("/{parent_type}/{parent_id}")
def create_comment(
    parent_type: str,
    parent_id: int,
    data: CommentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    if parent_type not in VALID_PARENT_TYPES:
        raise HTTPException(400, "Invalid parent_type")
    _assert_parent_access(parent_type, parent_id, user, db)
    text = data.text.strip()
    if not text:
        raise HTTPException(400, "Comment text cannot be empty")
    c = Comment(parent_type=parent_type, parent_id=parent_id, text=text, created_by=user.id)
    db.add(c)
    db.commit()
    db.refresh(c)
    commenter_name = _creator_name(user.id, db) or user.name
    background_tasks.add_task(
        _notify_thread_participants,
        db, parent_type, parent_id, user.id, commenter_name, text,
    )
    return _serialize_comment(c, db, user.id)


@router.delete("/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    c = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.is_deleted == False,  # noqa: E712
    ).first()
    if not c:
        raise HTTPException(404, "Comment not found")
    if c.created_by != user.id and user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(403, "Not allowed")
    c.is_deleted = True
    db.commit()


class ReactionToggle(BaseModel):
    emoji: str


@router.post("/{comment_id}/reactions")
def toggle_reaction(
    comment_id: int,
    data: ReactionToggle,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    c = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.is_deleted == False,  # noqa: E712
    ).first()
    if not c:
        raise HTTPException(404, "Comment not found")
    existing = db.query(CommentReaction).filter(
        CommentReaction.comment_id == comment_id,
        CommentReaction.user_id == user.id,
        CommentReaction.emoji == data.emoji,
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"action": "removed"}
    r = CommentReaction(comment_id=comment_id, user_id=user.id, emoji=data.emoji)
    db.add(r)
    db.commit()
    return {"action": "added"}

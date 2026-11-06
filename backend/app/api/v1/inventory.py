"""Zeugwart — the club's inventory of equipment and merchandise (stickers, pins, shirts, …).

Every member can see what the club has and what it still needs. The Zeugwart (a member
flagged ``is_zeugwart``, appointed by an admin) and admins keep it up to date: they add items,
set how many the club wants on hand, and book stock in or out. Each stock change is a
movement row, so the count always has a history behind it.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import require_club_admin, require_club_member
from api.v1.audit import _display_name, _is_admin, _my_member
from core.database import get_db
from core.schemas import TrimmedModel
from models.evening import RegularMember
from models.inventory import InventoryItem, InventoryMovement
from models.user import User

router = APIRouter(prefix="/inventory", tags=["inventory"])

MAX_COUNT = 1_000_000
MAX_NAME = 80
MAX_NOTE = 500


# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_zeugwart(db: Session, user: User) -> bool:
    m = _my_member(db, user)
    return bool(m and m.is_zeugwart and not m.is_guest)


def _can_edit(db: Session, user: User) -> bool:
    return _is_admin(user) or _is_zeugwart(db, user)


def _require_editor(db: Session, user: User) -> None:
    if not _can_edit(db, user):
        raise HTTPException(403, "Zeugwart or admin required")


def _get_item(db: Session, user: User, iid: int, lock: bool = False) -> InventoryItem:
    q = db.query(InventoryItem).filter(
        InventoryItem.id == iid,
        InventoryItem.club_id == user.club_id,
        InventoryItem.is_active == True,
    )
    if lock:
        q = q.with_for_update()
    item = q.first()
    if not item:
        raise HTTPException(404, "Item not found")
    return item


def _serialize(item: InventoryItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "icon": item.icon,
        "stock": item.stock,
        "target": item.target,
        "missing": max(0, item.target - item.stock),
        "note": item.note,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def _serialize_movement(m: InventoryMovement) -> dict:
    return {
        "id": m.id,
        "delta": m.delta,
        "stock_after": m.stock_after,
        "note": m.note,
        "actor_name": m.actor_name,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _check_count(value: int, field: str) -> None:
    if value < 0 or value > MAX_COUNT:
        raise HTTPException(400, f"{field} must be between 0 and {MAX_COUNT}")


def _check_text(value: Optional[str], field: str, limit: int) -> None:
    if value is not None and len(value) > limit:
        raise HTTPException(400, f"{field} is too long (max {limit})")


def _record(db: Session, user: User, item: InventoryItem, new_stock: int, note: Optional[str]) -> None:
    delta = new_stock - item.stock
    item.stock = new_stock
    db.add(InventoryMovement(
        item_id=item.id, delta=delta, stock_after=new_stock, note=note or None,
        user_id=user.id, actor_name=_display_name(db, user),
    ))


# ── Zeugwarte ────────────────────────────────────────────────────────────────

@router.get("/keepers")
def list_keepers(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    members = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_zeugwart == True,
        RegularMember.is_guest == False,
    ).order_by(RegularMember.name).all()
    return [{"id": m.id, "name": m.name, "nickname": m.nickname} for m in members]


class KeeperToggle(TrimmedModel):
    is_zeugwart: bool


@router.patch("/keepers/{mid}")
def set_keeper(mid: int, data: KeeperToggle, db: Session = Depends(get_db),
               user: User = Depends(require_club_admin)):
    member = db.query(RegularMember).filter(
        RegularMember.id == mid, RegularMember.club_id == user.club_id
    ).first()
    if not member:
        raise HTTPException(404, "Member not found")
    if member.is_guest and data.is_zeugwart:
        raise HTTPException(400, "Guests cannot be Zeugwart")
    member.is_zeugwart = data.is_zeugwart
    db.commit()
    return {"id": member.id, "is_zeugwart": member.is_zeugwart}


# ── Items ────────────────────────────────────────────────────────────────────

@router.get("/")
def list_items(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    items = db.query(InventoryItem).filter(
        InventoryItem.club_id == user.club_id,
        InventoryItem.is_active == True,
    ).order_by(InventoryItem.name).all()
    return {"can_edit": _can_edit(db, user), "items": [_serialize(i) for i in items]}


class ItemCreate(TrimmedModel):
    name: str
    icon: Optional[str] = None
    stock: int = 0
    target: int = 0
    note: Optional[str] = None


@router.post("/", status_code=201)
def create_item(data: ItemCreate, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    _require_editor(db, user)
    if not data.name:
        raise HTTPException(400, "Name is required")
    _check_text(data.name, "name", MAX_NAME)
    _check_text(data.note, "note", MAX_NOTE)
    _check_count(data.stock, "stock")
    _check_count(data.target, "target")
    item = InventoryItem(club_id=user.club_id, name=data.name, icon=data.icon or None,
                         stock=0, target=data.target, note=data.note or None)
    db.add(item)
    db.flush()
    if data.stock:
        _record(db, user, item, data.stock, None)
    db.commit()
    db.refresh(item)
    return _serialize(item)


class ItemUpdate(TrimmedModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    target: Optional[int] = None
    note: Optional[str] = None


@router.patch("/{iid}")
def update_item(iid: int, data: ItemUpdate, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    """Edit an item's details. The stock is not editable here — it moves only via movements."""
    _require_editor(db, user)
    item = _get_item(db, user, iid)
    fields = data.model_fields_set
    if "name" in fields:
        if not data.name:
            raise HTTPException(400, "Name is required")
        _check_text(data.name, "name", MAX_NAME)
    if "target" in fields:
        if data.target is None:
            raise HTTPException(400, "target must be a number")
        _check_count(data.target, "target")
    if "note" in fields:
        _check_text(data.note, "note", MAX_NOTE)
    if "name" in fields:
        item.name = data.name
    if "icon" in fields:
        item.icon = data.icon or None
    if "target" in fields:
        item.target = data.target
    if "note" in fields:
        item.note = data.note or None
    db.commit()
    db.refresh(item)
    return _serialize(item)


@router.delete("/{iid}", status_code=204)
def delete_item(iid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    _require_editor(db, user)
    item = _get_item(db, user, iid)
    item.is_active = False
    db.commit()


# ── Movements ────────────────────────────────────────────────────────────────

class MovementCreate(TrimmedModel):
    # Exactly one of the two: a change (+ in, − out) or a recount to an absolute number.
    delta: Optional[int] = None
    count: Optional[int] = None
    note: Optional[str] = None


@router.post("/{iid}/movements", status_code=201)
def add_movement(iid: int, data: MovementCreate, db: Session = Depends(get_db),
                 user: User = Depends(require_club_member)):
    _require_editor(db, user)
    if (data.delta is None) == (data.count is None):
        raise HTTPException(400, "Send either delta or count")
    _check_text(data.note, "note", MAX_NOTE)
    item = _get_item(db, user, iid, lock=True)
    if data.delta is not None:
        if data.delta == 0:
            raise HTTPException(400, "delta must not be 0")
        new_stock = item.stock + data.delta
        if new_stock < 0:
            raise HTTPException(400, f"Only {item.stock} in stock")
    else:
        new_stock = data.count
    _check_count(new_stock, "stock")
    if new_stock == item.stock:
        raise HTTPException(400, "Stock is already at that count")
    _record(db, user, item, new_stock, data.note)
    db.commit()
    db.refresh(item)
    return _serialize(item)


@router.get("/{iid}/movements")
def list_movements(iid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    item = _get_item(db, user, iid)
    rows = db.query(InventoryMovement).filter(InventoryMovement.item_id == item.id).order_by(
        InventoryMovement.created_at.desc(), InventoryMovement.id.desc()
    ).limit(200).all()
    return [_serialize_movement(m) for m in rows]

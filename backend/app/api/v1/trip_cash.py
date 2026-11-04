"""Kegelfahrt-Kasse — a shared cash box per trip, Splitwise-style.

Participants lay out money for the group (bus, hotel, a round at the bar) and hand each other
cash (an advance to the committee, a settle-up payment). The balance of each participant is what
they paid minus what they owe; the settlement list says who pays whom to bring everyone to zero.

All money math runs in integer cents, so a split always adds up to exactly the amount and the
balances always sum to zero. The trip cash box is deliberately separate from the club treasury:
trip money is the travellers' money, not the club's.
"""
import logging
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from core.schemas import TrimmedModel
from models.committee import ClubTrip, TripExpense, TripParticipant
from models.evening import RegularMember
from models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/committee/trips", tags=["trip-cash"])

MAX_AMOUNT = 100_000


# ── pure money math ───────────────────────────────────────────────────────────

def _cents(amount: float) -> int:
    return int(round(amount * 100))


def split_cents(total: int, member_ids: list[int]) -> dict[int, int]:
    """Split `total` cents evenly; the leftover cents go one each to the lowest member ids."""
    ids = sorted(set(member_ids))
    if not ids:
        return {}
    base, rest = divmod(total, len(ids))
    return {mid: base + (1 if i < rest else 0) for i, mid in enumerate(ids)}


def compute_balances(participant_ids: list[int], entries: list[dict]) -> dict[int, dict]:
    """Per participant: paid (laid out for the group), share (owed), and balance in cents.

    Each entry: {kind, amount_cents, paid_by, to, split} where split=None means all participants.
    A transfer moves cash between two people, so it shifts both balances without being a cost.
    """
    out = {mid: {"paid": 0, "share": 0, "sent": 0, "received": 0} for mid in participant_ids}
    for e in entries:
        payer = out.setdefault(e["paid_by"], {"paid": 0, "share": 0, "sent": 0, "received": 0})
        if e["kind"] == "transfer":
            payer["sent"] += e["amount_cents"]
            to = out.setdefault(e["to"], {"paid": 0, "share": 0, "sent": 0, "received": 0})
            to["received"] += e["amount_cents"]
            continue
        payer["paid"] += e["amount_cents"]
        for mid, share in split_cents(e["amount_cents"], e["split"] or participant_ids).items():
            out.setdefault(mid, {"paid": 0, "share": 0, "sent": 0, "received": 0})["share"] += share
    for row in out.values():
        row["balance"] = row["paid"] + row["sent"] - row["share"] - row["received"]
    return out


def settle(balances: dict[int, int]) -> list[dict]:
    """Greedy settle-up: the biggest debtor pays the biggest creditor until everyone is even.

    Produces at most n-1 payments. Ties break on member id, so the list is deterministic.
    """
    creditors = sorted(((b, mid) for mid, b in balances.items() if b > 0), key=lambda x: (-x[0], x[1]))
    debtors = sorted(((-b, mid) for mid, b in balances.items() if b < 0), key=lambda x: (-x[0], x[1]))
    creditors = [list(c) for c in creditors]
    debtors = [list(d) for d in debtors]
    payments = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        amount = min(debtors[i][0], creditors[j][0])
        if amount > 0:
            payments.append({"from_member_id": debtors[i][1], "to_member_id": creditors[j][1], "amount_cents": amount})
        debtors[i][0] -= amount
        creditors[j][0] -= amount
        if debtors[i][0] == 0:
            i += 1
        if creditors[j][0] == 0:
            j += 1
    return payments


# ── helpers ───────────────────────────────────────────────────────────────────

def _get_trip(db: Session, tid: int, user: User) -> ClubTrip:
    trip = db.query(ClubTrip).filter(
        ClubTrip.id == tid, ClubTrip.club_id == user.club_id, ClubTrip.is_deleted == False,  # noqa: E712
    ).first()
    if not trip:
        raise HTTPException(404, "Trip not found")
    return trip


def _can_manage(db: Session, user: User) -> bool:
    if user.role in (UserRole.admin, UserRole.superadmin):
        return True
    if not user.regular_member_id:
        return False
    member = db.query(RegularMember).filter(RegularMember.id == user.regular_member_id).first()
    return bool(member and member.is_committee)


def _participant_ids(db: Session, trip_id: int) -> list[int]:
    rows = db.query(TripParticipant.regular_member_id).filter(TripParticipant.trip_id == trip_id).all()
    return sorted(r[0] for r in rows)


def _active_expenses(db: Session, trip_id: int) -> list[TripExpense]:
    return db.query(TripExpense).filter(
        TripExpense.trip_id == trip_id, TripExpense.is_deleted == False,  # noqa: E712
    ).order_by(TripExpense.date.desc(), TripExpense.id.desc()).all()


def _entry(e: TripExpense) -> dict:
    return {
        "kind": e.kind, "amount_cents": _cents(e.amount), "paid_by": e.paid_by_member_id,
        "to": e.to_member_id, "split": e.split_member_ids or None,
    }


def _referenced_members(expenses: list[TripExpense]) -> set[int]:
    ids: set[int] = set()
    for e in expenses:
        ids.add(e.paid_by_member_id)
        if e.to_member_id:
            ids.add(e.to_member_id)
        ids.update(e.split_member_ids or [])
    return ids


def _serialize_cash(db: Session, trip: ClubTrip, user: User) -> dict:
    participant_ids = _participant_ids(db, trip.id)
    expenses = _active_expenses(db, trip.id)
    balances = compute_balances(participant_ids, [_entry(e) for e in expenses])
    member_ids = set(participant_ids) | set(balances)
    members = {m.id: m for m in db.query(RegularMember).filter(RegularMember.id.in_(member_ids)).all()} if member_ids else {}
    names = {
        u.id: u.name for u in db.query(User).filter(
            User.id.in_({e.created_by for e in expenses if e.created_by})
        ).all()
    } if expenses else {}
    can_manage = _can_manage(db, user)
    me = user.regular_member_id
    total = sum(_cents(e.amount) for e in expenses if e.kind == "expense")

    def member(mid: int) -> dict:
        m = members.get(mid)
        return {"id": mid, "name": m.name if m else "?", "nickname": m.nickname if m else None,
                "is_guest": bool(m and m.is_guest)}

    return {
        "trip_id": trip.id,
        "can_manage": can_manage,
        "can_add": can_manage or (me in participant_ids),
        "total": total / 100,
        "participants": [member(mid) for mid in participant_ids],
        "expenses": [{
            "id": e.id, "kind": e.kind, "description": e.description, "amount": round(e.amount, 2),
            "paid_by_member_id": e.paid_by_member_id, "to_member_id": e.to_member_id,
            "split_member_ids": e.split_member_ids or None,
            "date": e.date.isoformat() if e.date else None,
            "created_by_name": names.get(e.created_by),
            "can_delete": can_manage or (e.created_by is not None and e.created_by == user.id),
        } for e in expenses],
        "balances": [{
            **member(mid),
            "paid": b["paid"] / 100, "share": b["share"] / 100, "balance": b["balance"] / 100,
        } for mid, b in sorted(balances.items())],
        "settlements": [{
            "from_member_id": p["from_member_id"], "to_member_id": p["to_member_id"],
            "amount": p["amount_cents"] / 100,
        } for p in settle({mid: b["balance"] for mid, b in balances.items()})],
    }


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{tid}/cash")
def get_trip_cash(tid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    return _serialize_cash(db, _get_trip(db, tid, user), user)


class ParticipantsUpdate(TrimmedModel):
    member_ids: list[int]


@router.put("/{tid}/cash/participants")
def set_participants(tid: int, data: ParticipantsUpdate, db: Session = Depends(get_db),
                     user: User = Depends(require_club_member)):
    """Replace the participant list. Committee or admin only."""
    trip = _get_trip(db, tid, user)
    if not _can_manage(db, user):
        raise HTTPException(403, "Vergnügungsausschuss or admin required")
    wanted = set(data.member_ids)
    if wanted:
        found = {m.id for m in db.query(RegularMember).filter(
            RegularMember.id.in_(wanted), RegularMember.club_id == user.club_id,
        ).all()}
        if found != wanted:
            raise HTTPException(400, "Unknown member")
    current = set(_participant_ids(db, trip.id))
    removed = current - wanted
    if removed & _referenced_members(_active_expenses(db, trip.id)):
        raise HTTPException(400, "A participant with bookings cannot be removed")
    if removed:
        db.query(TripParticipant).filter(
            TripParticipant.trip_id == trip.id, TripParticipant.regular_member_id.in_(removed),
        ).delete(synchronize_session=False)
    for mid in wanted - current:
        db.add(TripParticipant(trip_id=trip.id, regular_member_id=mid))
    db.commit()
    logger.info("Trip %d participants set to %s by user=%d", trip.id, sorted(wanted), user.id)
    return _serialize_cash(db, trip, user)


class ExpenseCreate(TrimmedModel):
    kind: Literal["expense", "transfer"] = "expense"
    description: str = Field(min_length=1, max_length=200)
    amount: float
    paid_by_member_id: int
    to_member_id: Optional[int] = None
    split_member_ids: Optional[list[int]] = None
    date: Optional[str] = None


@router.post("/{tid}/cash/expenses", status_code=201)
def add_expense(tid: int, data: ExpenseCreate, db: Session = Depends(get_db),
                user: User = Depends(require_club_member)):
    trip = _get_trip(db, tid, user)
    participants = set(_participant_ids(db, trip.id))
    if not (_can_manage(db, user) or user.regular_member_id in participants):
        raise HTTPException(403, "Only participants or the committee can book")
    if not (0 < data.amount <= MAX_AMOUNT) or _cents(data.amount) == 0:
        raise HTTPException(400, "Invalid amount")
    if data.paid_by_member_id not in participants:
        raise HTTPException(400, "Payer is not a participant")
    split = None
    if data.kind == "transfer":
        if data.to_member_id not in participants or data.to_member_id == data.paid_by_member_id:
            raise HTTPException(400, "Recipient must be another participant")
    else:
        if data.split_member_ids is not None:
            split = sorted(set(data.split_member_ids))
            if not split or not set(split) <= participants:
                raise HTTPException(400, "Split must be a non-empty subset of the participants")
            if set(split) == participants:
                split = None  # "everyone" stays everyone, even when participants change later
    booked = None
    if data.date:
        try:
            booked = date.fromisoformat(data.date[:10])
        except ValueError:
            raise HTTPException(400, "Invalid date")
    db.add(TripExpense(
        trip_id=trip.id, kind=data.kind, description=data.description, amount=round(data.amount, 2),
        paid_by_member_id=data.paid_by_member_id,
        to_member_id=data.to_member_id if data.kind == "transfer" else None,
        split_member_ids=split, date=booked or date.today(), created_by=user.id,
    ))
    db.commit()
    logger.info("Trip %d: %s %.2f booked by user=%d", trip.id, data.kind, data.amount, user.id)
    return _serialize_cash(db, trip, user)


@router.delete("/{tid}/cash/expenses/{eid}")
def delete_expense(tid: int, eid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    trip = _get_trip(db, tid, user)
    expense = db.query(TripExpense).filter(
        TripExpense.id == eid, TripExpense.trip_id == trip.id, TripExpense.is_deleted == False,  # noqa: E712
    ).first()
    if not expense:
        raise HTTPException(404, "Entry not found")
    if not (_can_manage(db, user) or expense.created_by == user.id):
        raise HTTPException(403, "Only the creator or the committee can delete")
    expense.is_deleted = True
    db.commit()
    return _serialize_cash(db, trip, user)

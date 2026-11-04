"""Kassenprüfung — frozen treasury reports for a period, signed off by the club's auditors.

German clubs elect Kassenprüfer at the AGM who check the treasurer's books once a year.
This module gives them a record to sign: an admin or auditor freezes the bookings of a
period into a snapshot (opening/closing cash, every booking, every edit and cancellation,
open balances), and each auditor approves it or raises an objection with a remark.

The treasury itself is already readable by every member, so being an auditor grants
exactly one extra right: signing.
"""
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import require_club_admin, require_club_member
from core.database import get_db
from core.push import push_to_club_admins, push_to_regular_member
from core.schemas import TrimmedModel
from models.audit import TreasuryAudit, TreasuryAuditSignature
from models.evening import RegularMember
from models.payment import ClubExpense, MemberPayment
from models.user import User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/treasury-audits", tags=["treasury-audits"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_admin(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.superadmin)


def _my_member(db: Session, user: User) -> Optional[RegularMember]:
    if not user.regular_member_id:
        return None
    return db.query(RegularMember).filter(
        RegularMember.id == user.regular_member_id,
        RegularMember.club_id == user.club_id,
    ).first()


def _is_auditor(db: Session, user: User) -> bool:
    m = _my_member(db, user)
    return bool(m and m.is_auditor and not m.is_guest)


def _display_name(db: Session, user: User) -> str:
    m = _my_member(db, user)
    return (m.nickname or m.name) if m else user.name


def _booking_date(row) -> Optional[date]:
    """The date a booking counts on: its explicit (backdated) date, else its creation day."""
    if row.date:
        return row.date
    return row.created_at.date() if row.created_at else None


def _day(dt: Optional[datetime]) -> Optional[date]:
    return dt.date() if dt else None


def _r(v: float) -> float:
    return round(v + 0.0, 2)


def _user_names(db: Session, ids: set) -> dict[int, str]:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    users = db.query(User).filter(User.id.in_(ids)).all()
    member_ids = {u.regular_member_id for u in users if u.regular_member_id}
    members = {m.id: m for m in db.query(RegularMember).filter(RegularMember.id.in_(member_ids)).all()} \
        if member_ids else {}
    out = {}
    for u in users:
        m = members.get(u.regular_member_id)
        out[u.id] = (m.nickname or m.name) if m else u.name
    return out


def compute_audit_snapshot(db: Session, club_id: int, start: date, end: date) -> dict:
    """Freeze the treasury for [start, end] (both inclusive) into a JSON-serialisable dict.

    Cash on hand is the same quantity the Kasse shows: every member/guest payment (signed)
    minus every club expense (signed — negative expenses are other income). Opening cash is
    that sum over all non-cancelled bookings dated before ``start``; closing cash adds the
    period's movements. Cancelled (soft-deleted) bookings never count toward cash, but every
    cancellation and every edit that happened inside the period is listed so the auditors
    can ask about it.
    """
    members = {m.id: m for m in db.query(RegularMember).filter(RegularMember.club_id == club_id).all()}

    def member_label(mid: int) -> str:
        m = members.get(mid)
        return (m.nickname or m.name) if m else f"#{mid}"

    payments = db.query(MemberPayment).filter(MemberPayment.club_id == club_id).all()
    expenses = db.query(ClubExpense).filter(ClubExpense.club_id == club_id).all()

    user_ids = set()
    for row in [*payments, *expenses]:
        user_ids.update({row.created_by, row.updated_by, row.deleted_by})
    names = _user_names(db, user_ids)

    opening = 0.0
    deposits = payouts = expenses_gross = other_income = 0.0
    bookings: list[dict] = []
    edited: list[dict] = []
    cancelled: list[dict] = []

    def entry(kind: str, row) -> dict:
        is_payment = kind == "payment"
        d = _booking_date(row)
        return {
            "kind": kind,
            "id": row.id,
            "date": d.isoformat() if d else None,
            # Cash effect: payments add their signed amount, expenses subtract theirs.
            "amount": _r(row.amount if is_payment else -row.amount),
            "label": member_label(row.regular_member_id) if is_payment else row.description,
            "note": row.note if is_payment else None,
            "created_by": names.get(row.created_by),
        }

    for kind, rows in (("payment", payments), ("expense", expenses)):
        for row in rows:
            d = _booking_date(row)
            if d is None:
                continue
            if not row.is_deleted:
                effect = row.amount if kind == "payment" else -row.amount
                if d < start:
                    opening += effect
                elif d <= end:
                    if kind == "payment":
                        if row.amount >= 0:
                            deposits += row.amount
                        else:
                            payouts += -row.amount
                    elif row.amount >= 0:
                        expenses_gross += row.amount
                    else:
                        other_income += -row.amount
                    bookings.append(entry(kind, row))
            upd = _day(row.updated_at)
            if upd and start <= upd <= end:
                edited.append({**entry(kind, row), "updated_at": row.updated_at.isoformat(),
                               "updated_by": names.get(row.updated_by), "cancelled": bool(row.is_deleted)})
            dele = _day(row.deleted_at)
            if row.is_deleted and dele and start <= dele <= end:
                cancelled.append({**entry(kind, row), "deleted_at": row.deleted_at.isoformat(),
                                  "deleted_by": names.get(row.deleted_by), "reason": row.delete_reason})

    bookings.sort(key=lambda b: (b["date"] or "", b["kind"], b["id"]))
    edited.sort(key=lambda b: b["updated_at"])
    cancelled.sort(key=lambda b: b["deleted_at"])

    closing = opening + deposits - payouts - expenses_gross + other_income

    # Open balances are a "now" figure — penalties are not dated bookings, so the honest label
    # is "as of the audit", which is what the frontend shows.
    from api.v1.club import get_guest_balances, get_member_balances
    proxy = type("_ClubScope", (), {"club_id": club_id})()
    balances = []
    for row in get_member_balances(db=db, user=proxy):
        balances.append({**row, "is_guest": False})
    for row in get_guest_balances(db=db, user=proxy):
        balances.append({
            "regular_member_id": row.get("regular_member_id"), "name": row.get("name"),
            "nickname": row.get("nickname"), "penalty_total": row.get("penalty_total"),
            "payments_total": row.get("payments_total"), "balance": row.get("balance"), "is_guest": True,
        })
    outstanding = sum(-b["balance"] for b in balances if (b["balance"] or 0) < 0)
    credit = sum(b["balance"] for b in balances if (b["balance"] or 0) > 0)

    return {
        "opening_cash": _r(opening),
        "deposits": _r(deposits),
        "payouts": _r(payouts),
        "expenses": _r(expenses_gross),
        "other_income": _r(other_income),
        "closing_cash": _r(closing),
        "booking_count": len(bookings),
        "outstanding_total": _r(outstanding),
        "credit_total": _r(credit),
        "bookings": bookings,
        "edited": edited,
        "cancelled": cancelled,
        "balances": balances,
    }


def _status(signatures: list[TreasuryAuditSignature]) -> str:
    if not signatures:
        return "open"
    if any(not s.approved for s in signatures):
        return "objection"
    return "approved"


def _serialize(db: Session, audit: TreasuryAudit, user: User, full: bool) -> dict:
    sigs = db.query(TreasuryAuditSignature).filter(
        TreasuryAuditSignature.audit_id == audit.id
    ).order_by(TreasuryAuditSignature.signed_at, TreasuryAuditSignature.id).all()
    snap = audit.snapshot or {}
    out = {
        "id": audit.id,
        "title": audit.title,
        "period_start": audit.period_start.isoformat(),
        "period_end": audit.period_end.isoformat(),
        "created_at": audit.created_at.isoformat() if audit.created_at else None,
        "created_by_name": _user_names(db, {audit.created_by}).get(audit.created_by),
        "status": _status(sigs),
        "signed_by_me": any(s.user_id == user.id for s in sigs),
        "signatures": [{
            "id": s.id, "signer_name": s.signer_name, "approved": s.approved, "note": s.note,
            "signed_at": s.signed_at.isoformat() if s.signed_at else None, "is_me": s.user_id == user.id,
        } for s in sigs],
        "summary": {k: snap.get(k) for k in (
            "opening_cash", "deposits", "payouts", "expenses", "other_income", "closing_cash",
            "booking_count", "outstanding_total", "credit_total",
        )} | {"edited_count": len(snap.get("edited", [])), "cancelled_count": len(snap.get("cancelled", []))},
    }
    if full:
        out["snapshot"] = snap
    return out


def _get_audit(db: Session, aid: int, user: User) -> TreasuryAudit:
    audit = db.query(TreasuryAudit).filter(
        TreasuryAudit.id == aid, TreasuryAudit.club_id == user.club_id
    ).first()
    if not audit:
        raise HTTPException(404, "Audit not found")
    return audit


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise HTTPException(400, f"Invalid {field} — use YYYY-MM-DD")


# ── Auditors ─────────────────────────────────────────────────────────────────

@router.get("/auditors")
def list_auditors(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    members = db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id,
        RegularMember.is_auditor == True,
        RegularMember.is_guest == False,
    ).order_by(RegularMember.name).all()
    return [{"id": m.id, "name": m.name, "nickname": m.nickname} for m in members]


class AuditorToggle(TrimmedModel):
    is_auditor: bool


@router.patch("/auditors/{mid}")
def set_auditor(mid: int, data: AuditorToggle, db: Session = Depends(get_db),
                user: User = Depends(require_club_admin)):
    member = db.query(RegularMember).filter(
        RegularMember.id == mid, RegularMember.club_id == user.club_id
    ).first()
    if not member:
        raise HTTPException(404, "Member not found")
    if member.is_guest and data.is_auditor:
        raise HTTPException(400, "Guests cannot be auditors")
    member.is_auditor = data.is_auditor
    db.commit()
    return {"id": member.id, "is_auditor": member.is_auditor}


# ── Audits ───────────────────────────────────────────────────────────────────

@router.get("/")
def list_audits(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    audits = db.query(TreasuryAudit).filter(
        TreasuryAudit.club_id == user.club_id
    ).order_by(TreasuryAudit.period_end.desc(), TreasuryAudit.id.desc()).all()
    return {
        "can_create": _is_admin(user) or _is_auditor(db, user),
        "can_sign": _is_auditor(db, user),
        "audits": [_serialize(db, a, user, full=False) for a in audits],
    }


@router.get("/preview")
def preview_audit(period_start: str, period_end: str, db: Session = Depends(get_db),
                  user: User = Depends(require_club_member)):
    """The snapshot an audit for this period would freeze — lets the creator check before committing."""
    start = _parse_date(period_start, "period_start")
    end = _parse_date(period_end, "period_end")
    if end < start:
        raise HTTPException(400, "period_end must not be before period_start")
    return compute_audit_snapshot(db, user.club_id, start, end)


@router.get("/{aid}")
def get_audit(aid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    return _serialize(db, _get_audit(db, aid, user), user, full=True)


class AuditCreate(TrimmedModel):
    period_start: str
    period_end: str
    title: Optional[str] = None


@router.post("/", status_code=201)
def create_audit(data: AuditCreate, background_tasks: BackgroundTasks,
                 db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    if not (_is_admin(user) or _is_auditor(db, user)):
        raise HTTPException(403, "Admin or auditor required")
    start = _parse_date(data.period_start, "period_start")
    end = _parse_date(data.period_end, "period_end")
    if end < start:
        raise HTTPException(400, "period_end must not be before period_start")
    audit = TreasuryAudit(
        club_id=user.club_id,
        title=data.title or None,
        period_start=start,
        period_end=end,
        snapshot=compute_audit_snapshot(db, user.club_id, start, end),
        created_by=user.id,
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    logger.info("Treasury audit created: id=%d club=%d user=%d period=%s..%s",
                audit.id, user.club_id, user.id, start, end)

    auditor_ids = [m.id for m in db.query(RegularMember).filter(
        RegularMember.club_id == user.club_id, RegularMember.is_auditor == True,
        RegularMember.is_guest == False,
    ).all() if m.id != user.regular_member_id]
    period = f"{start.strftime('%d.%m.%Y')} – {end.strftime('%d.%m.%Y')}"
    for mid in auditor_ids:
        background_tasks.add_task(
            push_to_regular_member, db, mid,
            "🔍 Kassenprüfung bereit",
            f"Die Kasse für {period} wartet auf deine Prüfung.",
            f"/#treasury:audit?audit={audit.id}",
            category="payments",
        )
    return _serialize(db, audit, user, full=True)


class AuditSign(TrimmedModel):
    approved: bool
    note: Optional[str] = None


@router.post("/{aid}/sign")
def sign_audit(aid: int, data: AuditSign, background_tasks: BackgroundTasks,
               db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    if not _is_auditor(db, user):
        raise HTTPException(403, "Only auditors can sign an audit")
    audit = _get_audit(db, aid, user)
    if db.query(TreasuryAuditSignature).filter(
        TreasuryAuditSignature.audit_id == audit.id, TreasuryAuditSignature.user_id == user.id
    ).first():
        raise HTTPException(400, "Already signed")
    if not data.approved and not data.note:
        raise HTTPException(400, "An objection needs a remark")
    name = _display_name(db, user)
    db.add(TreasuryAuditSignature(
        audit_id=audit.id, user_id=user.id, signer_name=name,
        approved=data.approved, note=data.note or None,
    ))
    db.commit()
    logger.info("Treasury audit %d signed by user=%d approved=%s", audit.id, user.id, data.approved)
    verdict = "bestätigt ✅" if data.approved else "beanstandet ⚠️"
    background_tasks.add_task(
        push_to_club_admins, db, user.club_id,
        "🔍 Kassenprüfung",
        f"{name} hat die Kasse {verdict}.",
        f"/#treasury:audit?audit={audit.id}",
        category="payments",
    )
    return _serialize(db, audit, user, full=True)


@router.delete("/{aid}/sign", status_code=204)
def withdraw_signature(aid: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """An auditor may take back their own verdict (e.g. after a question was answered)."""
    audit = _get_audit(db, aid, user)
    sig = db.query(TreasuryAuditSignature).filter(
        TreasuryAuditSignature.audit_id == audit.id, TreasuryAuditSignature.user_id == user.id
    ).first()
    if not sig:
        raise HTTPException(404, "No signature to withdraw")
    db.delete(sig)
    db.commit()


@router.delete("/{aid}", status_code=204)
def delete_audit(aid: int, db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    audit = _get_audit(db, aid, user)
    if db.query(TreasuryAuditSignature).filter(TreasuryAuditSignature.audit_id == audit.id).count():
        raise HTTPException(400, "A signed audit cannot be deleted")
    db.delete(audit)
    db.commit()

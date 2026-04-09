"""Season closing workflow endpoints."""
import logging
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import require_club_admin, require_club_member
from core.database import get_db
from models.evening import Evening, EveningPlayer, RegularMember
from models.payment import MemberPayment
from models.penalty import PenaltyLog, PenaltyMode
from models.season import SeasonSnapshot
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/season", tags=["season"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _penalty_euro(log: PenaltyLog) -> float:
    if log.mode == "euro":
        return log.amount
    if log.unit_amount is not None:
        return log.amount * log.unit_amount
    return 0.0


def _compute_balances(db: Session, club_id: int, year: Optional[int] = None) -> list[dict]:
    """Compute member balances, optionally filtered to a specific year."""
    members = db.query(RegularMember).filter(
        RegularMember.club_id == club_id,
        RegularMember.is_active == True,
        RegularMember.is_guest == False,
    ).order_by(RegularMember.name).all()

    start_date = datetime(year, 1, 1) if year else None
    end_date = datetime(year + 1, 1, 1) if year else None

    eq = (
        db.query(EveningPlayer.id, EveningPlayer.regular_member_id)
        .join(Evening, Evening.id == EveningPlayer.evening_id)
        .filter(Evening.club_id == club_id, EveningPlayer.regular_member_id.isnot(None))
    )
    if year:
        eq = eq.filter(Evening.date >= start_date, Evening.date < end_date)
    player_rows = eq.all()

    member_player_ids: dict[int, list[int]] = {}
    for pid, mid in player_rows:
        member_player_ids.setdefault(mid, []).append(pid)

    all_player_ids = [pid for ids in member_player_ids.values() for pid in ids]
    penalty_rows = (
        db.query(PenaltyLog)
        .filter(PenaltyLog.player_id.in_(all_player_ids), PenaltyLog.is_deleted == False)
        .all()
    ) if all_player_ids else []
    penalty_by_player: dict[int, float] = {}
    for log in penalty_rows:
        penalty_by_player[log.player_id] = penalty_by_player.get(log.player_id, 0.0) + _penalty_euro(log)

    aq = (
        db.query(PenaltyLog)
        .join(Evening, Evening.id == PenaltyLog.evening_id)
        .filter(
            Evening.club_id == club_id,
            PenaltyLog.player_id.is_(None),
            PenaltyLog.regular_member_id.isnot(None),
            PenaltyLog.is_deleted == False,
        )
    )
    if year:
        aq = aq.filter(Evening.date >= start_date, Evening.date < end_date)
    absence_rows = aq.all()

    absence_by_member: dict[int, float] = {}
    for log in absence_rows:
        absence_by_member[log.regular_member_id] = absence_by_member.get(log.regular_member_id, 0.0) + _penalty_euro(log)

    pq = db.query(MemberPayment).filter(MemberPayment.club_id == club_id)
    if year:
        pq = pq.filter(
            MemberPayment.created_at >= start_date,
            MemberPayment.created_at < end_date,
        )
    payments = pq.all()
    payments_by_member: dict[int, float] = {}
    for p in payments:
        payments_by_member[p.regular_member_id] = payments_by_member.get(p.regular_member_id, 0.0) + p.amount

    result = []
    for m in members:
        player_ids = member_player_ids.get(m.id, [])
        penalty_total = sum(penalty_by_player.get(pid, 0.0) for pid in player_ids)
        penalty_total += absence_by_member.get(m.id, 0.0)
        payments_total = payments_by_member.get(m.id, 0.0)
        result.append({
            "regular_member_id": m.id,
            "name": m.name,
            "nickname": m.nickname,
            "penalty_total": round(penalty_total, 2),
            "payments_total": round(payments_total, 2),
            "balance": round(payments_total - penalty_total, 2),
        })
    return result


def _compute_year_ranking(db: Session, club_id: int, year: int) -> list[dict]:
    """Replicates get_year_stats players list — frozen ranking snapshot."""
    start_date = datetime(year, 1, 1)
    end_date = datetime(year + 1, 1, 1)

    evenings = db.query(Evening).filter(
        Evening.club_id == club_id,
        Evening.date >= start_date,
        Evening.date < end_date,
    ).all()

    player_stats: dict = defaultdict(lambda: {
        "name": "", "regular_member_id": None, "evenings": 0,
        "penalty_total": 0.0, "penalty_count": 0,
        "game_wins": 0, "beer_rounds": 0, "shot_rounds": 0,
        "total_pins": 0, "throw_count": 0,
    })
    for e in evenings:
        for p in e.players:
            key = p.regular_member_id or f"guest_{p.name}"
            player_stats[key]["name"] = p.name
            player_stats[key]["regular_member_id"] = p.regular_member_id
            player_stats[key]["evenings"] += 1
            for log in e.penalty_log:
                if log.player_id == p.id and not log.is_deleted:
                    if log.mode == PenaltyMode.euro:
                        player_stats[key]["penalty_total"] += log.amount
                    player_stats[key]["penalty_count"] += 1
            for g in e.games:
                if not g.is_deleted:
                    if g.winner_ref == f"p:{p.id}":
                        player_stats[key]["game_wins"] += 1
                    for th in g.throws:
                        if th.player_id == p.id:
                            player_stats[key]["total_pins"] += th.pins
                            player_stats[key]["throw_count"] += 1
            for r in e.drink_rounds:
                if not r.is_deleted and p.id in r.participant_ids:
                    if r.drink_type == "beer":
                        player_stats[key]["beer_rounds"] += 1
                    else:
                        player_stats[key]["shot_rounds"] += 1

    players_list = sorted(player_stats.values(), key=lambda x: x["penalty_total"], reverse=True)
    for p_stat in players_list:
        tc = p_stat["throw_count"]
        p_stat["avg_pins"] = round(p_stat["total_pins"] / tc, 1) if tc > 0 else None
    return players_list


def _snapshot_to_dict(snap: SeasonSnapshot, db: Session) -> dict:
    closed_by_name = None
    if snap.closed_by_id:
        from models.user import User as UserModel
        u = db.get(UserModel, snap.closed_by_id)
        if u:
            closed_by_name = u.name
    return {
        "id": snap.id,
        "year": snap.year,
        "closed_at": snap.closed_at.isoformat() if snap.closed_at else None,
        "closed_by_name": closed_by_name,
        "member_count": snap.member_count,
        "evening_count": snap.evening_count,
        "carry_over_count": snap.carry_over_count,
        "total_penalties": snap.total_penalties,
        "total_payments": snap.total_payments,
        "ranking_data": snap.ranking_data,
        "notes": snap.notes,
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class SeasonCloseRequest(BaseModel):
    year: int
    notes: Optional[str] = None
    settle_member_ids: Optional[list[int]] = None  # if set, only settle these members' balances


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/snapshots")
def list_snapshots(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """List all season snapshots for the current club, newest first."""
    snaps = (
        db.query(SeasonSnapshot)
        .filter(SeasonSnapshot.club_id == user.club_id)
        .order_by(SeasonSnapshot.year.desc())
        .all()
    )
    return [_snapshot_to_dict(s, db) for s in snaps]


@router.get("/snapshots/{year}")
def get_snapshot(year: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Get the season snapshot for a specific year."""
    snap = (
        db.query(SeasonSnapshot)
        .filter(SeasonSnapshot.club_id == user.club_id, SeasonSnapshot.year == year)
        .first()
    )
    if not snap:
        raise HTTPException(status_code=404, detail=f"No snapshot found for year {year}")
    return _snapshot_to_dict(snap, db)


@router.delete("/snapshots/{year}", status_code=204)
def reopen_season(
    year: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """Reopen a closed season: delete the snapshot and reverse carry-over payments."""
    snap = (
        db.query(SeasonSnapshot)
        .filter(SeasonSnapshot.club_id == user.club_id, SeasonSnapshot.year == year)
        .first()
    )
    if not snap:
        raise HTTPException(status_code=404, detail=f"No snapshot found for year {year}")

    # Reverse all carry-over payments created during season close
    db.query(MemberPayment).filter(
        MemberPayment.club_id == user.club_id,
        MemberPayment.note == f"Jahresabschluss {year}",
    ).delete(synchronize_session=False)

    db.delete(snap)
    db.commit()
    logger.info("Season %d reopened by user %d (club %d)", year, user.id, user.club_id)


@router.get("/available-years")
def list_available_years(db: Session = Depends(get_db), user: User = Depends(require_club_admin)):
    """Return distinct years that have at least one evening, plus the current year."""
    from sqlalchemy import extract, func
    rows = (
        db.query(extract("year", Evening.date).label("yr"))
        .filter(Evening.club_id == user.club_id)
        .group_by("yr")
        .order_by(func.extract("year", Evening.date).desc())
        .all()
    )
    years = sorted({int(r.yr) for r in rows} | {datetime.now().year}, reverse=True)
    return years


@router.get("/balance-preview/{year}")
def get_balance_preview(
    year: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """Return non-zero member balances for the given year (year-specific)."""
    if not 2000 <= year <= 2100:
        raise HTTPException(status_code=400, detail="Invalid year")
    balances = _compute_balances(db, user.club_id, year=year)
    return [b for b in balances if abs(b["balance"]) >= 0.01]


@router.post("/close", status_code=201)
def close_season(
    data: SeasonCloseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """Perform the full season-closing workflow for the given year."""
    if not 2000 <= data.year <= 2100:
        raise HTTPException(status_code=400, detail="Invalid year")

    existing = (
        db.query(SeasonSnapshot)
        .filter(SeasonSnapshot.club_id == user.club_id, SeasonSnapshot.year == data.year)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Season {data.year} has already been closed")

    # Step A — Compute year-specific member balances
    balances = _compute_balances(db, user.club_id, year=data.year)
    total_penalties = sum(b["penalty_total"] for b in balances)
    total_payments = sum(b["payments_total"] for b in balances)

    # Step B — Book carry-over payments for selected members only
    settle_set = set(data.settle_member_ids) if data.settle_member_ids is not None else None
    carry_over_count = 0
    for b in balances:
        if settle_set is not None and b["regular_member_id"] not in settle_set:
            continue
        balance = b["balance"]
        if abs(round(balance, 2)) >= 0.01:
            db.add(MemberPayment(
                club_id=user.club_id,
                regular_member_id=b["regular_member_id"],
                amount=round(-balance, 2),
                note=f"Jahresabschluss {data.year}",
                created_by=user.id,
            ))
            carry_over_count += 1

    # Step C — Bulk-close open evenings in the year
    start = datetime(data.year, 1, 1)
    end = datetime(data.year + 1, 1, 1)
    open_evenings = (
        db.query(Evening)
        .filter(
            Evening.club_id == user.club_id,
            Evening.is_closed == False,
            Evening.date >= start,
            Evening.date < end,
        )
        .all()
    )
    for e in open_evenings:
        e.is_closed = True

    evening_count = (
        db.query(Evening)
        .filter(
            Evening.club_id == user.club_id,
            Evening.date >= start,
            Evening.date < end,
        )
        .count()
    )

    # Step D — Freeze ranking snapshot
    ranking_data = _compute_year_ranking(db, user.club_id, data.year)

    # Step E — Create and commit snapshot
    snap = SeasonSnapshot(
        club_id=user.club_id,
        year=data.year,
        closed_by_id=user.id,
        ranking_data=ranking_data,
        member_count=len(balances),
        evening_count=evening_count,
        carry_over_count=carry_over_count,
        total_penalties=round(total_penalties, 2),
        total_payments=round(total_payments, 2),
        notes=data.notes,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)

    logger.info("Season %d closed by user %d (club %d)", data.year, user.id, user.club_id)
    return _snapshot_to_dict(snap, db)

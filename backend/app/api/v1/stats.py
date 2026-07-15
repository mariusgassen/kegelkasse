"""Statistics and analysis endpoints."""
import math
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from models.evening import Evening, RegularMember
from models.penalty import PenaltyMode
from models.user import User

router = APIRouter(prefix="/stats", tags=["stats"])


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    """Pearson correlation coefficient. Returns None for n<3 or zero variance on either side."""
    n = len(xs)
    if n < 3 or n != len(ys):
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x == 0 or var_y == 0:
        return None
    cov = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    denom = math.sqrt(var_x * var_y)
    if denom == 0:
        return None
    return round(cov / denom, 3)


def _penalty_euro(log) -> float:
    """Total € value of a penalty log entry, matching the convention used everywhere else
    in the app (euro mode → amount; count mode → count × unit_amount)."""
    if log.mode == PenaltyMode.euro:
        return float(log.amount)
    if log.unit_amount is not None:
        return float(log.amount) * float(log.unit_amount)
    return 0.0


@router.get("/year/{year}")
def get_year_stats(year: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Yearly rollup — penalty totals, game wins, drink counts per regular member."""
    start_date = datetime(year, 1, 1)
    end_date = datetime(year + 1, 1, 1)

    evenings = db.query(Evening).filter(
        Evening.club_id == user.club_id,
        Evening.date >= start_date,
        Evening.date < end_date,
    ).all()

    player_stats: dict = defaultdict(lambda: {"name": "", "regular_member_id": None, "evenings": 0,
                                              "penalty_total": 0.0, "penalty_count": 0,
                                              "game_wins": 0, "beer_rounds": 0, "shot_rounds": 0,
                                              "total_pins": 0, "throw_count": 0})
    for e in evenings:
        for p in e.players:
            key = p.regular_member_id or f"guest_{p.name}"
            player_stats[key]["name"] = p.name
            player_stats[key]["regular_member_id"] = p.regular_member_id
            player_stats[key]["evenings"] += 1
            for l in e.penalty_log:
                if l.player_id == p.id and not l.is_deleted:
                    player_stats[key]["penalty_total"] += _penalty_euro(l)
                    player_stats[key]["penalty_count"] += 1
            for g in e.games:
                if not g.is_deleted:
                    # A win counts when the player won individually OR was on the winning team.
                    if g.winner_ref == f"p:{p.id}" or (p.team_id and g.winner_ref == f"t:{p.team_id}"):
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

        # Absence penalties (player_id=None, regular_member_id set) belong to a member
        # who wasn't a player that evening — attribute them directly so they count
        # toward the member's yearly total.
        for l in e.penalty_log:
            if l.player_id is None and l.regular_member_id is not None and not l.is_deleted:
                ps = player_stats[l.regular_member_id]
                ps["regular_member_id"] = l.regular_member_id
                if not ps["name"]:
                    ps["name"] = l.player_name or ""
                ps["penalty_total"] += _penalty_euro(l)
                ps["penalty_count"] += 1

    players_list = sorted(player_stats.values(), key=lambda x: x["penalty_total"], reverse=True)
    for p_stat in players_list:
        tc = p_stat["throw_count"]
        p_stat["avg_pins"] = round(p_stat["total_pins"] / tc, 1) if tc > 0 else None

    return {
        "year": year,
        "evening_count": len(evenings),
        "total_penalties": sum(
            _penalty_euro(l) for e in evenings for l in e.penalty_log
            if not l.is_deleted
        ),
        "total_beers": sum(
            len(r.participant_ids) for e in evenings for r in e.drink_rounds
            if not r.is_deleted and r.drink_type == "beer"
        ),
        "total_shots": sum(
            len(r.participant_ids) for e in evenings for r in e.drink_rounds
            if not r.is_deleted and r.drink_type == "shots"
        ),
        "players": players_list
    }


def _build_throw_stats(evenings: list, regular_member_id: int, year: int | None) -> dict:
    """Compute per-evening throw stats for a given regular_member_id."""
    evening_rows = []
    total_pins = 0
    throw_count = 0

    for e in sorted(evenings, key=lambda x: x.date):
        player = next((p for p in e.players if p.regular_member_id == regular_member_id), None)
        if not player:
            continue
        ep_pins = 0
        ep_throws = 0
        for g in e.games:
            if g.is_deleted:
                continue
            for th in g.throws:
                if th.player_id == player.id:
                    ep_pins += th.pins
                    ep_throws += 1
        if ep_throws == 0:
            continue
        avg = round(ep_pins / ep_throws, 1)
        evening_rows.append({
            "evening_id": e.id,
            "date": e.date.isoformat(),
            "location": e.venue,
            "total_pins": ep_pins,
            "throw_count": ep_throws,
            "avg_pins": avg,
        })
        total_pins += ep_pins
        throw_count += ep_throws

    avgs = [r["avg_pins"] for r in evening_rows]
    return {
        "regular_member_id": regular_member_id,
        "year": year,
        "total_pins": total_pins,
        "throw_count": throw_count,
        "avg_pins": round(total_pins / throw_count, 1) if throw_count > 0 else None,
        "best_avg": max(avgs) if avgs else None,
        "worst_avg": min(avgs) if avgs else None,
        "evenings": evening_rows,
    }


# NOTE: /me/throws must be registered BEFORE /me/{year} to prevent FastAPI
# from trying to parse "throws" as an integer year parameter.
@router.get("/me/throws")
def get_my_throw_stats(
    year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    """Personal throw statistics per evening (optionally filtered by year)."""
    mid = user.regular_member_id
    if not mid:
        return {"regular_member_id": None, "year": year, "total_pins": 0,
                "throw_count": 0, "avg_pins": None, "best_avg": None, "worst_avg": None, "evenings": []}

    q = db.query(Evening).filter(Evening.club_id == user.club_id)
    if year:
        q = q.filter(Evening.date >= datetime(year, 1, 1), Evening.date < datetime(year + 1, 1, 1))
    return _build_throw_stats(q.all(), mid, year)


@router.get("/members/{member_id}/throws")
def get_member_throw_stats(
    member_id: int,
    year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    """Throw statistics per evening for any club member (visible to all club members)."""
    member = db.query(RegularMember).filter(
        RegularMember.id == member_id,
        RegularMember.club_id == user.club_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    q = db.query(Evening).filter(Evening.club_id == user.club_id)
    if year:
        q = q.filter(Evening.date >= datetime(year, 1, 1), Evening.date < datetime(year + 1, 1, 1))
    return _build_throw_stats(q.all(), member_id, year)


# ---------------------------------------------------------------------------
# Achievements & Badges  (Feature: gamification / regular check-in)
# ---------------------------------------------------------------------------

# Tier thresholds per tiered badge: (bronze, silver, gold)
_TIERS = ("bronze", "silver", "gold")


def _tiered(value: float, thresholds: tuple) -> dict:
    """Resolve a numeric value into a tiered badge state.

    Returns earned flag, the current tier name (or None), the raw progress
    value, and the next threshold to reach (None once gold is maxed out).
    """
    bronze, silver, gold = thresholds
    if value >= gold:
        return {"earned": True, "tier": "gold", "progress": value, "target": None}
    if value >= silver:
        return {"earned": True, "tier": "silver", "progress": value, "target": gold}
    if value >= bronze:
        return {"earned": True, "tier": "bronze", "progress": value, "target": silver}
    return {"earned": False, "tier": None, "progress": value, "target": bronze}


def _binary(earned: bool) -> dict:
    return {"earned": bool(earned), "tier": None, "progress": 1 if earned else 0, "target": None}


def _longest_run(flags: list[bool]) -> int:
    """Longest run of consecutive True values."""
    best = cur = 0
    for f in flags:
        cur = cur + 1 if f else 0
        best = max(best, cur)
    return best


def _compute_achievements(evenings: list, member_id: int) -> list[dict]:
    """Career-wide badge set for a member, derived purely from evening data.

    Evenings may be passed in any order; sorted chronologically here so that
    streak / hattrick badges are computed against the real timeline.
    """
    ordered = sorted(evenings, key=lambda e: e.date)

    attended = 0
    king_count = 0
    game_wins = 0
    beer_rounds = 0
    shot_rounds = 0
    penalty_total = 0.0
    won_president = False
    threw_all_nine = False
    had_clean_evening = False
    attendance_flags: list[bool] = []   # per chronological evening: did member play?
    king_flags: list[bool] = []         # per attended evening (chronological): was king?

    for e in ordered:
        player = next((p for p in e.players if p.regular_member_id == member_id), None)
        attendance_flags.append(player is not None)
        if not player:
            continue
        attended += 1

        if player.is_king:
            king_count += 1
            king_flags.append(True)
        else:
            king_flags.append(False)

        evening_penalties = 0
        for log in e.penalty_log:
            if log.player_id == player.id and not log.is_deleted:
                penalty_total += _penalty_euro(log)
                evening_penalties += 1
        # Absence penalties still count toward the "unlucky" total.
        if evening_penalties == 0:
            had_clean_evening = True

        for g in e.games:
            if g.is_deleted:
                continue
            if g.winner_ref == f"p:{player.id}" or (player.team_id and g.winner_ref == f"t:{player.team_id}"):
                game_wins += 1
                if g.is_president_game:
                    won_president = True
            for th in g.throws:
                if th.player_id == player.id and th.pins >= 9:
                    threw_all_nine = True

        for r in e.drink_rounds:
            if not r.is_deleted and player.id in (r.participant_ids or []):
                if r.drink_type == "beer":
                    beer_rounds += 1
                else:
                    shot_rounds += 1

    # Absence penalties (player_id None, regular_member_id set) also raise the total.
    for e in ordered:
        for log in e.penalty_log:
            if log.player_id is None and log.regular_member_id == member_id and not log.is_deleted:
                penalty_total += _penalty_euro(log)

    longest_attendance_streak = _longest_run(attendance_flags)
    longest_king_streak = _longest_run(king_flags)

    def badge(key: str, icon: str, state: dict) -> dict:
        return {"key": key, "icon": icon, **state}

    return [
        badge("first_evening", "🎳", _binary(attended >= 1)),
        badge("stammgast", "📅", _tiered(attended, (10, 25, 50))),
        badge("streak", "🔥", _tiered(longest_attendance_streak, (3, 5, 10))),
        badge("king", "👑", _tiered(king_count, (1, 5, 10))),
        badge("hattrick", "🃏", _binary(longest_king_streak >= 3)),
        badge("president", "🎯", _binary(won_president)),
        badge("champion", "🏆", _tiered(game_wins, (10, 25, 50))),
        badge("allnine", "9️⃣", _binary(threw_all_nine)),
        badge("bierkoenig", "🍺", _tiered(beer_rounds, (20, 50, 100))),
        badge("hochprozentig", "🥃", _tiered(shot_rounds, (10, 25, 50))),
        badge("pechvogel", "💸", _tiered(round(penalty_total, 2), (50, 150, 300))),
        badge("saubermann", "😇", _binary(had_clean_evening)),
    ]


def _compute_wrapped(evenings: list, member_id: int, year: int,
                     year_penalty_by_member: dict) -> dict:
    """Personal 'Kegel-Wrapped' year recap for a member — funny derived stats.

    ``year_penalty_by_member`` maps regular_member_id → penalty € total for the
    year and is used to compute the member's penalty rank among the club.
    """
    ordered = sorted(evenings, key=lambda e: e.date)
    total_evenings = len(ordered)

    attended = 0
    penalty_total = 0.0
    penalty_count = 0
    king_count = 0
    game_wins = 0
    total_beers = 0
    total_shots = 0
    total_pins = 0
    throw_count = 0
    best_avg_pins: float | None = None
    biggest_penalty: dict | None = None
    penalty_type_counts: dict = defaultdict(lambda: {"count": 0, "icon": "⚠️"})

    for e in ordered:
        player = next((p for p in e.players if p.regular_member_id == member_id), None)
        # Absence penalties count toward the yearly total even without attendance.
        for log in e.penalty_log:
            if log.player_id is None and log.regular_member_id == member_id and not log.is_deleted:
                penalty_total += _penalty_euro(log)
                penalty_count += 1
        if not player:
            continue
        attended += 1
        if player.is_king:
            king_count += 1

        ep_pins = 0
        ep_throws = 0
        for log in e.penalty_log:
            if log.player_id == player.id and not log.is_deleted:
                amt = _penalty_euro(log)
                penalty_total += amt
                penalty_count += 1
                pt = penalty_type_counts[log.penalty_type_name]
                pt["count"] += 1
                pt["icon"] = log.icon or "⚠️"
                if biggest_penalty is None or amt > biggest_penalty["amount"]:
                    biggest_penalty = {
                        "amount": round(amt, 2),
                        "name": log.penalty_type_name,
                        "icon": log.icon or "⚠️",
                        "date": e.date.isoformat(),
                    }
        for g in e.games:
            if g.is_deleted:
                continue
            if g.winner_ref == f"p:{player.id}" or (player.team_id and g.winner_ref == f"t:{player.team_id}"):
                game_wins += 1
            for th in g.throws:
                if th.player_id == player.id:
                    ep_pins += th.pins
                    ep_throws += 1
        total_pins += ep_pins
        throw_count += ep_throws
        if ep_throws > 0:
            ev_avg = ep_pins / ep_throws
            if best_avg_pins is None or ev_avg > best_avg_pins:
                best_avg_pins = round(ev_avg, 1)

        for r in e.drink_rounds:
            if not r.is_deleted and player.id in (r.participant_ids or []):
                if r.drink_type == "beer":
                    total_beers += 1
                else:
                    total_shots += 1

    top_penalty_type = None
    if penalty_type_counts:
        name, info = max(penalty_type_counts.items(), key=lambda kv: kv[1]["count"])
        top_penalty_type = {"name": name, "icon": info["icon"], "count": info["count"]}

    # Rank among members by penalty € (1 = most). Only members with a positive
    # total are ranked; ties share the standard-competition higher position.
    ranked = sorted(
        [(mid, tot) for mid, tot in year_penalty_by_member.items() if tot > 0],
        key=lambda kv: kv[1], reverse=True,
    )
    penalty_rank = None
    for idx, (mid, _tot) in enumerate(ranked):
        if mid == member_id:
            penalty_rank = idx + 1
            break

    attendance_pct = round(100 * attended / total_evenings) if total_evenings else 0
    avg_pins = round(total_pins / throw_count, 1) if throw_count > 0 else None

    # Derived "personality" title — returned as a stable key the frontend localizes.
    if penalty_rank == 1 and penalty_total > 0:
        title_key, title_icon = "sinner", "😈"
    elif king_count >= 3:
        title_key, title_icon = "monarch", "👑"
    elif total_beers >= 20 and total_beers >= total_shots * 2:
        title_key, title_icon = "beerbaron", "🍺"
    elif game_wins >= 10:
        title_key, title_icon = "champion", "🏆"
    elif attendance_pct >= 90 and attended >= 5:
        title_key, title_icon = "loyal", "🎖️"
    elif attended > 0 and penalty_total == 0:
        title_key, title_icon = "saint", "😇"
    else:
        title_key, title_icon = "allrounder", "🎳"

    return {
        "year": year,
        "regular_member_id": member_id,
        "has_data": attended > 0 or penalty_count > 0,
        "evenings_attended": attended,
        "total_evenings": total_evenings,
        "attendance_pct": attendance_pct,
        "penalty_total": round(penalty_total, 2),
        "penalty_count": penalty_count,
        "biggest_penalty": biggest_penalty,
        "top_penalty_type": top_penalty_type,
        "king_count": king_count,
        "game_wins": game_wins,
        "total_beers": total_beers,
        "total_shots": total_shots,
        "avg_pins": avg_pins,
        "best_avg_pins": best_avg_pins,
        "penalty_rank": penalty_rank,
        "ranked_members": len(ranked),
        "title_key": title_key,
        "title_icon": title_icon,
    }


def _year_penalty_by_member(evenings: list) -> dict:
    """penalty € total per regular_member_id across the given evenings."""
    totals: dict = defaultdict(float)
    for e in evenings:
        for p in e.players:
            if p.regular_member_id is None:
                continue
            for log in e.penalty_log:
                if log.player_id == p.id and not log.is_deleted:
                    totals[p.regular_member_id] += _penalty_euro(log)
        for log in e.penalty_log:
            if log.player_id is None and log.regular_member_id is not None and not log.is_deleted:
                totals[log.regular_member_id] += _penalty_euro(log)
    return totals


# NOTE: /me/achievements must be registered BEFORE /me/{year} so FastAPI does
# not try to parse "achievements" as an integer year.
@router.get("/me/achievements")
def get_my_achievements(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Career badge shelf for the current user."""
    mid = user.regular_member_id
    if not mid:
        return {"regular_member_id": None, "achievements": _compute_achievements([], 0)}
    evenings = db.query(Evening).filter(Evening.club_id == user.club_id).all()
    return {"regular_member_id": mid, "achievements": _compute_achievements(evenings, mid)}


@router.get("/members/{member_id}/achievements")
def get_member_achievements(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    """Career badge shelf for any club member (visible to all club members)."""
    member = db.query(RegularMember).filter(
        RegularMember.id == member_id,
        RegularMember.club_id == user.club_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    evenings = db.query(Evening).filter(Evening.club_id == user.club_id).all()
    return {"regular_member_id": member_id, "achievements": _compute_achievements(evenings, member_id)}


@router.get("/me/wrapped/{year}")
def get_my_wrapped(year: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Personal 'Kegel-Wrapped' year recap for the current user."""
    mid = user.regular_member_id
    evenings = db.query(Evening).filter(
        Evening.club_id == user.club_id,
        Evening.date >= datetime(year, 1, 1),
        Evening.date < datetime(year + 1, 1, 1),
    ).all()
    if not mid:
        return _compute_wrapped([], 0, year, {})
    return _compute_wrapped(evenings, mid, year, _year_penalty_by_member(evenings))


@router.get("/members/{member_id}/wrapped/{year}")
def get_member_wrapped(
    member_id: int,
    year: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    """Personal 'Kegel-Wrapped' year recap for any club member."""
    member = db.query(RegularMember).filter(
        RegularMember.id == member_id,
        RegularMember.club_id == user.club_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    evenings = db.query(Evening).filter(
        Evening.club_id == user.club_id,
        Evening.date >= datetime(year, 1, 1),
        Evening.date < datetime(year + 1, 1, 1),
    ).all()
    return _compute_wrapped(evenings, member_id, year, _year_penalty_by_member(evenings))


@router.get("/me/{year}")
def get_my_stats(year: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Personal stats for the current user in the given year."""
    start_date = datetime(year, 1, 1)
    end_date = datetime(year + 1, 1, 1)

    evenings = db.query(Evening).filter(
        Evening.club_id == user.club_id,
        Evening.date >= start_date,
        Evening.date < end_date,
    ).all()

    mid = user.regular_member_id
    penalty_total = 0.0
    evenings_attended = 0
    game_wins = 0
    beer_rounds = 0
    total_pins = 0
    throw_count = 0

    for e in evenings:
        # Absence penalties are attributed to the member even on evenings they
        # didn't attend (player_id=None, regular_member_id set).
        for l in e.penalty_log:
            if l.player_id is None and l.regular_member_id == mid and not l.is_deleted:
                penalty_total += _penalty_euro(l)
        player = next((p for p in e.players if p.regular_member_id == mid), None)
        if not player:
            continue
        evenings_attended += 1
        for l in e.penalty_log:
            if l.player_id == player.id and not l.is_deleted:
                penalty_total += _penalty_euro(l)
        for g in e.games:
            if not g.is_deleted:
                if g.winner_ref == f"p:{player.id}":
                    game_wins += 1
                for th in g.throws:
                    if th.player_id == player.id:
                        total_pins += th.pins
                        throw_count += 1
        for r in e.drink_rounds:
            if not r.is_deleted and player.id in r.participant_ids and r.drink_type == "beer":
                beer_rounds += 1

    return {
        "year": year,
        "regular_member_id": mid,
        "penalty_total": penalty_total,
        "evenings_attended": evenings_attended,
        "total_evenings": len(evenings),
        "game_wins": game_wins,
        "beer_rounds": beer_rounds,
        "total_pins": total_pins,
        "throw_count": throw_count,
        "avg_pins": round(total_pins / throw_count, 1) if throw_count > 0 else None,
    }


@router.get("/correlation/{year}")
def get_correlation_stats(year: int, db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    """Penalty × drinks correlation for a year.

    Returns per-evening points (one per evening) and per-member rollups including
    each member's personal Pearson r across their own evenings.
    """
    start_date = datetime(year, 1, 1)
    end_date = datetime(year + 1, 1, 1)

    evenings = db.query(Evening).filter(
        Evening.club_id == user.club_id,
        Evening.date >= start_date,
        Evening.date < end_date,
    ).order_by(Evening.date).all()

    evening_points: list[dict] = []
    member_acc: dict = defaultdict(lambda: {
        "regular_member_id": None,
        "name": "",
        "nickname": None,
        "evenings_count": 0,
        "total_penalty_euro": 0.0,
        "total_drink_count": 0,
        "evening_points": [],  # list[{evening_id, date, penalty_euro, drink_count}]
    })

    for e in evenings:
        ev_penalty = 0.0
        ev_drinks = 0
        player_count = len(e.players)
        for log in e.penalty_log:
            # Exclude absence penalties (player_id is None) — only present-player penalties.
            if not log.is_deleted and log.player_id is not None:
                ev_penalty += _penalty_euro(log)
        for r in e.drink_rounds:
            if not r.is_deleted:
                ev_drinks += len(r.participant_ids or [])
        if player_count > 0:
            avg_penalty = round(ev_penalty / player_count, 2)
            avg_drinks = round(ev_drinks / player_count, 2)
        else:
            avg_penalty = 0.0
            avg_drinks = 0.0
        evening_points.append({
            "evening_id": e.id,
            "date": e.date.isoformat(),
            "penalty_euro": avg_penalty,
            "drink_count": avg_drinks,
        })

        for p in e.players:
            if p.regular_member_id is None:
                continue  # guest — skip from member rollup
            p_penalty = 0.0
            for log in e.penalty_log:
                if log.player_id == p.id and not log.is_deleted:
                    p_penalty += _penalty_euro(log)
            p_drinks = 0
            for r in e.drink_rounds:
                if not r.is_deleted and p.id in (r.participant_ids or []):
                    p_drinks += 1
            acc = member_acc[p.regular_member_id]
            acc["regular_member_id"] = p.regular_member_id
            acc["name"] = p.regular_member.name if p.regular_member else p.name
            acc["nickname"] = p.regular_member.nickname if p.regular_member else None
            acc["evenings_count"] += 1
            acc["total_penalty_euro"] += p_penalty
            acc["total_drink_count"] += p_drinks
            acc["evening_points"].append({
                "evening_id": e.id,
                "date": e.date.isoformat(),
                "penalty_euro": round(p_penalty, 2),
                "drink_count": p_drinks,
            })

    members_list = []
    for acc in member_acc.values():
        points = acc["evening_points"]
        xs = [p["penalty_euro"] for p in points]
        ys = [float(p["drink_count"]) for p in points]
        acc["total_penalty_euro"] = round(acc["total_penalty_euro"], 2)
        acc["personal_pearson_r"] = _pearson(xs, ys)
        members_list.append(acc)
    members_list.sort(key=lambda m: m["total_penalty_euro"], reverse=True)

    overall_r = _pearson(
        [pt["penalty_euro"] for pt in evening_points],
        [float(pt["drink_count"]) for pt in evening_points],
    )

    return {
        "year": year,
        "overall_pearson_r": overall_r,
        "evenings": evening_points,
        "members": members_list,
    }


@router.get("/correlation/evening/{evening_id}")
def get_evening_correlation(
    evening_id: int,
    bin_minutes: int = Query(default=15, ge=5, le=60),
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    """Within-evening time-binned penalty + drink series per member with derivative Pearson r."""
    evening = db.query(Evening).filter(Evening.id == evening_id).first()
    if not evening:
        raise HTTPException(status_code=404, detail="Evening not found")
    if evening.club_id != user.club_id:
        raise HTTPException(status_code=403, detail="Evening belongs to a different club")

    # Include count-mode penalties (amount * unit_amount) so the within-evening
    # total matches what every other view in the app shows. We still skip
    # absent-member entries (player_id is None) because they can't be drawn on a
    # heat lane — they aren't tied to a specific player.
    penalties = [log for log in evening.penalty_log
                 if not log.is_deleted and log.player_id is not None]
    drinks = [r for r in evening.drink_rounds if not r.is_deleted]

    all_ts = [log.client_timestamp for log in penalties] + [r.client_timestamp for r in drinks]
    bin_ms = bin_minutes * 60_000

    members_out: list[dict] = []
    for p in evening.players:
        # per-member events
        p_penalties = [(log.client_timestamp, _penalty_euro(log)) for log in penalties if log.player_id == p.id]
        p_drinks = [r.client_timestamp for r in drinks if p.id in (r.participant_ids or [])]

        if not p_penalties and not p_drinks:
            members_out.append({
                "regular_member_id": p.regular_member_id,
                "evening_player_id": p.id,
                "name": p.regular_member.name if p.regular_member else p.name,
                "nickname": p.regular_member.nickname if p.regular_member else None,
                "bins": [],
                "derivative_pearson_r": None,
            })
            continue

        # Anchor bin grid on the evening's earliest event (consistent across members)
        if all_ts:
            t0 = min(all_ts)
            t_end = max(all_ts)
        else:
            t0 = (evening.created_at.replace(tzinfo=timezone.utc).timestamp() * 1000
                  if evening.created_at else 0.0)
            t_end = t0

        n_bins = max(1, int(math.floor((t_end - t0) / bin_ms)) + 1)
        if n_bins > 200:
            n_bins = 200

        deltas_penalty = [0.0] * n_bins
        deltas_drinks = [0] * n_bins
        for ts, amount in p_penalties:
            idx = min(n_bins - 1, max(0, int((ts - t0) // bin_ms)))
            deltas_penalty[idx] += amount
        for ts in p_drinks:
            idx = min(n_bins - 1, max(0, int((ts - t0) // bin_ms)))
            deltas_drinks[idx] += 1

        bins_arr = []
        cum_p = 0.0
        cum_d = 0
        for i in range(n_bins):
            cum_p += deltas_penalty[i]
            cum_d += deltas_drinks[i]
            bin_start_ms = t0 + i * bin_ms
            bins_arr.append({
                "t": datetime.fromtimestamp(bin_start_ms / 1000, tz=timezone.utc).isoformat(),
                "delta_penalty": round(deltas_penalty[i], 2),
                "delta_drinks": deltas_drinks[i],
                "cum_penalty": round(cum_p, 2),
                "cum_drinks": cum_d,
            })

        r = _pearson(
            [b["delta_penalty"] for b in bins_arr],
            [float(b["cum_drinks"]) for b in bins_arr],
        )

        members_out.append({
            "regular_member_id": p.regular_member_id,
            "evening_player_id": p.id,
            "name": p.regular_member.name if p.regular_member else p.name,
            "nickname": p.regular_member.nickname if p.regular_member else None,
            "bins": bins_arr,
            "derivative_pearson_r": r,
        })

    return {
        "evening_id": evening.id,
        "date": evening.date.isoformat(),
        "bin_minutes": bin_minutes,
        "members": members_out,
    }

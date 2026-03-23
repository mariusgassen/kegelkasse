"""Statistics and analysis endpoints."""
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from models.evening import Evening
from models.penalty import PenaltyMode
from models.user import User

router = APIRouter(prefix="/stats", tags=["stats"])


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
                    if l.mode == PenaltyMode.euro:
                        player_stats[key]["penalty_total"] += l.amount
                    player_stats[key]["penalty_count"] += 1
            for g in e.games:
                if not g.is_deleted:
                    if g.winner_ref in (f"p:{p.id}",):
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

    return {
        "year": year,
        "evening_count": len(evenings),
        "total_penalties": sum(
            l.amount for e in evenings for l in e.penalty_log
            if not l.is_deleted and l.mode == PenaltyMode.euro
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
        player = next((p for p in e.players if p.regular_member_id == mid), None)
        if not player:
            continue
        evenings_attended += 1
        for l in e.penalty_log:
            if l.player_id == player.id and not l.is_deleted and l.mode == PenaltyMode.euro:
                penalty_total += l.amount
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

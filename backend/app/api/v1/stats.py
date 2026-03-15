"""Statistics and analysis endpoints."""
from collections import defaultdict

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
    evenings = db.query(Evening).filter(
        Evening.club_id == user.club_id,
        Evening.date.like(f"{year}%")
    ).all()

    player_stats: dict = defaultdict(lambda: {"name": "", "evenings": 0, "penalty_total": 0.0,
                                              "penalty_count": 0, "game_wins": 0,
                                              "beer_rounds": 0, "shot_rounds": 0})
    for e in evenings:
        for p in e.players:
            key = p.regular_member_id or f"guest_{p.name}"
            player_stats[key]["name"] = p.name
            player_stats[key]["evenings"] += 1
            for l in e.penalty_log:
                if l.player_id == p.id and not l.is_deleted:
                    if l.mode == PenaltyMode.euro:
                        player_stats[key]["penalty_total"] += l.amount
                    player_stats[key]["penalty_count"] += 1
            for g in e.games:
                if not g.is_deleted and g.winner_ref in (f"p:{p.id}",):
                    player_stats[key]["game_wins"] += 1
            for r in e.drink_rounds:
                if not r.is_deleted and p.id in r.participant_ids:
                    if r.drink_type == "beer":
                        player_stats[key]["beer_rounds"] += 1
                    else:
                        player_stats[key]["shot_rounds"] += 1

    return {
        "year": year,
        "evening_count": len(evenings),
        "total_penalties": sum(
            l.amount for e in evenings for l in e.penalty_log
            if not l.is_deleted and l.mode == PenaltyMode.euro
        ),
        "total_beer_rounds": sum(len(e.drink_rounds) for e in evenings),
        "players": sorted(player_stats.values(), key=lambda x: x["penalty_total"], reverse=True)
    }

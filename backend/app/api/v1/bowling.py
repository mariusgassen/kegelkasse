"""Club-wide leaderboard for the hidden mini bowling game (Easter egg)."""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from core.schemas import TrimmedModel
from sqlalchemy.orm import Session

from api.deps import require_club_member
from core.database import get_db
from models.bowling import BowlingScore
from models.evening import RegularMember
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bowling", tags=["bowling"])

LEADERBOARD_LIMIT = 10
# 3 balls, each against a full rack of 9 (a cleared rack re-racks for the next ball) → 27 max.
MAX_GAME_SCORE = 27


class ScoreIn(TrimmedModel):
    score: int


class LeaderboardEntry(TrimmedModel):
    rank: int
    player_name: str
    score: int
    date: Optional[datetime]
    is_me: bool


class SubmitResult(TrimmedModel):
    leaderboard: list[LeaderboardEntry]
    rank: Optional[int]  # the just-submitted game's leaderboard rank, or None if outside the top N
    is_record: bool  # the submission is the new club #1


def _display_name(user: User, db: Session) -> str:
    """Kegelname (nickname) if the account is linked to a regular member, else the account name."""
    if user.regular_member_id:
        rm = db.query(RegularMember).filter(RegularMember.id == user.regular_member_id).first()
        if rm and rm.nickname:
            return rm.nickname
        if rm and rm.name:
            return rm.name
    return user.name


def _leaderboard(db: Session, club_id: int, me: User) -> list[LeaderboardEntry]:
    rows = (
        db.query(BowlingScore)
        .filter(BowlingScore.club_id == club_id)
        .order_by(BowlingScore.score.desc(), BowlingScore.created_at.asc())
        .limit(LEADERBOARD_LIMIT)
        .all()
    )
    entries: list[LeaderboardEntry] = []
    for i, r in enumerate(rows):
        is_me = (
            (me.regular_member_id is not None and r.regular_member_id == me.regular_member_id)
            or r.user_id == me.id
        )
        entries.append(LeaderboardEntry(
            rank=i + 1, player_name=r.player_name, score=r.score, date=r.created_at, is_me=is_me,
        ))
    return entries


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db), user: User = Depends(require_club_member)):
    return _leaderboard(db, user.club_id, user)


@router.post("/scores", response_model=SubmitResult)
def submit_score(
    payload: ScoreIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_club_member),
):
    if payload.score < 0 or payload.score > MAX_GAME_SCORE:
        raise HTTPException(status_code=400, detail="Invalid score")

    entry = BowlingScore(
        club_id=user.club_id,
        user_id=user.id,
        regular_member_id=user.regular_member_id,
        player_name=_display_name(user, db),
        score=payload.score,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    board = _leaderboard(db, user.club_id, user)
    # This game's leaderboard rank = the position of this exact row in the top list (None if it
    # didn't make the top N).
    top_rows = (
        db.query(BowlingScore.id)
        .filter(BowlingScore.club_id == user.club_id)
        .order_by(BowlingScore.score.desc(), BowlingScore.created_at.asc())
        .limit(LEADERBOARD_LIMIT)
        .all()
    )
    rank = next((i + 1 for i, (rid,) in enumerate(top_rows) if rid == entry.id), None)
    return SubmitResult(leaderboard=board, rank=rank, is_record=rank == 1)

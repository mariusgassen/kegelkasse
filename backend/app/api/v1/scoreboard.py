"""
Public read-only TV / beamer scoreboard (#74).

A screen at the lane has no keyboard and nobody wants to type a password into a TV, so this is the
one surface of the app that is reachable without a login. Authentication is a secret token in the
URL — the same pattern the iCal feed (#24) already uses: an unguessable uuid4 in
`ClubSettings.extra`, rotatable by an admin, which invalidates every link that carries it.

Because the link is unauthenticated, the payload is a purpose-built projection rather than the full
`Evening` serialization: display names, the running game, its throws, the evening's penalty tally,
drink counters, the latest highlight and the king. No balances, no e-mail addresses, no member
records — nothing that isn't already written on the board in the club room.
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from core.database import get_db
from core.events import event_bus
from models.club import Club, ClubSettings
from models.evening import Evening, EveningPlayer
from models.game import Game
from models.penalty import PenaltyLog, PenaltyMode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scoreboard", tags=["scoreboard"])

# The running game's throw history is a display strip, not an archive.
MAX_THROWS = 40
MAX_PENALTY_RANKING = 10


def _resolve_club(token: str, db: Session) -> Club:
    """Find the club whose scoreboard token matches, or 404.

    Linear scan over `club_setting`, mirroring the iCal feed: the table has one row per club, the
    token lives inside a JSON blob, and there are no clubs at a scale where this matters.
    """
    for s in db.query(ClubSettings).all():
        extra = s.extra or {}
        if isinstance(extra, str):
            extra = json.loads(extra)
        if token and extra.get("scoreboard_token") == token:
            club = db.query(Club).filter(Club.id == s.club_id).first()
            if club:
                return club
            break
    raise HTTPException(404, "Invalid token")


def _active_evening(club: Club, db: Session) -> Optional[Evening]:
    """The evening currently in progress, if any (there can only ever be one open per club)."""
    return (db.query(Evening)
            .filter(Evening.club_id == club.id, Evening.is_closed == False)  # noqa: E712
            .order_by(Evening.date.desc())
            .first())


def _display_name(p: EveningPlayer) -> str:
    """Kegelname first, per the app-wide display-name convention; guests fall back to their name."""
    rm = p.regular_member
    if rm and rm.nickname:
        return rm.nickname
    return p.name


def _penalty_euro(log: PenaltyLog) -> float:
    """€ value of a penalty entry (euro mode → amount; count mode → count × unit_amount)."""
    if log.mode == PenaltyMode.euro:
        return float(log.amount)
    if log.unit_amount is not None:
        return float(log.amount) * float(log.unit_amount)
    return 0.0


def _turn_order(evening: Evening, game: Game) -> list[EveningPlayer]:
    """Throw order for the running game — port of the frontend's `buildTurnOrder`.

    Alternating mode interleaves the teams round-robin and appends unassigned players; block mode
    plays one team through, the block being the active player's team.
    """
    players = list(evening.players)
    teams = list(evening.teams)
    if not teams:
        return players

    by_team = [[p for p in players if p.team_id == t.id] for t in teams]

    if (game.turn_mode or "alternating") == "block":
        active = next((p for p in players if p.id == game.active_player_id), None)
        idx = next((i for i, t in enumerate(teams) if active and t.id == active.team_id), 0)
        block = by_team[idx % len(teams)]
        return block or players

    order: list[EveningPlayer] = []
    for i in range(max((len(t) for t in by_team), default=0)):
        for team in by_team:
            if i < len(team):
                order.append(team[i])
    order += [p for p in players if p.team_id is None]
    return order or players


def _serialize_game(evening: Evening, game: Game, throw_tracking: bool) -> dict:
    by_id = {p.id: p for p in evening.players}
    active = by_id.get(game.active_player_id) if game.active_player_id is not None else None

    next_player = None
    if active:
        order = _turn_order(evening, game)
        ids = [p.id for p in order]
        if active.id in ids and len(order) > 1:
            next_player = order[(ids.index(active.id) + 1) % len(order)]

    throws: list[dict] = []
    standings: list[dict] = []
    if throw_tracking:
        ordered = sorted(game.throws, key=lambda t: t.throw_num)
        throws = [{
            "id": t.id,
            "throw_num": t.throw_num,
            "pins": t.pins,
            "player_id": t.player_id,
            "player_name": _display_name(by_id[t.player_id]) if t.player_id in by_id else None,
        } for t in ordered[-MAX_THROWS:]]

        tally: dict[int, dict] = {}
        for t in ordered:
            if t.player_id is None or t.player_id not in by_id:
                continue
            row = tally.setdefault(t.player_id, {
                "player_id": t.player_id,
                "name": _display_name(by_id[t.player_id]),
                "pins": 0,
                "throws": 0,
            })
            row["pins"] += t.pins
            row["throws"] += 1
        standings = sorted(tally.values(), key=lambda r: (-r["pins"], r["name"]))

    return {
        "id": game.id,
        "name": game.name,
        "is_opener": bool(game.is_opener),
        "turn_mode": game.turn_mode,
        "active_player": {"id": active.id, "name": _display_name(active)} if active else None,
        "next_player": {"id": next_player.id, "name": _display_name(next_player)} if next_player else None,
        "throws": throws,
        "standings": standings,
    }


def _serialize_evening(evening: Evening, throw_tracking: bool) -> dict:
    by_id = {p.id: p for p in evening.players}
    games = [g for g in evening.games if not g.is_deleted]
    running = next((g for g in games if g.status == "running"), None)
    finished = [g for g in games if g.status == "finished"]

    penalties = [l for l in evening.penalty_log if not l.is_deleted]
    tally: dict[str, float] = {}
    for l in penalties:
        # Uncapped live tally: this is a scoreboard, not a bill (the guest cap is a treasury rule).
        name = _display_name(by_id[l.player_id]) if l.player_id in by_id else l.player_name
        tally[name] = tally.get(name, 0.0) + _penalty_euro(l)
    ranking = sorted(
        ({"name": n, "amount": round(a, 2)} for n, a in tally.items() if a > 0),
        key=lambda r: (-r["amount"], r["name"]),
    )[:MAX_PENALTY_RANKING]

    drinks = [d for d in evening.drink_rounds if not d.is_deleted]
    per_player: dict[str, int] = {}
    for d in drinks:
        for pid in (d.participant_ids or []):
            if pid in by_id:
                name = _display_name(by_id[pid])
                per_player[name] = per_player.get(name, 0) + 1

    king = next((p for p in evening.players if p.is_king), None)
    highlight = max(
        (h for h in evening.highlights if h.created_at),
        key=lambda h: h.created_at,
        default=None,
    )
    last_finished = max(finished, key=lambda g: (g.finished_at or g.sort_order or 0), default=None) if finished else None

    return {
        "id": evening.id,
        "date": evening.date.isoformat() if evening.date else None,
        "venue": evening.venue,
        "player_count": len(evening.players),
        "game": _serialize_game(evening, running, throw_tracking) if running else None,
        "last_result": {
            "name": last_finished.name,
            "winner_name": last_finished.winner_name,
        } if last_finished else None,
        "penalty_ranking": ranking,
        "drinks": {
            "beer": sum(1 for d in drinks if d.drink_type == "beer"),
            "shots": sum(1 for d in drinks if d.drink_type == "shots"),
            "per_player": sorted(
                ({"name": n, "count": c} for n, c in per_player.items()),
                key=lambda r: (-r["count"], r["name"]),
            )[:MAX_PENALTY_RANKING],
        },
        "king": {"name": _display_name(king)} if king else None,
        "highlight": {
            "text": highlight.text,
            "media_url": highlight.media_url,
            "created_at": highlight.created_at.isoformat(),
        } if highlight else None,
        "totals": {
            "penalty_euro": round(sum(_penalty_euro(l) for l in penalties), 2),
            "games_finished": len(finished),
            "games_total": len(games),
        },
    }


@router.get("/{token}")
def get_scoreboard(token: str, db: Session = Depends(get_db)):
    """Public scoreboard payload — club branding plus the running evening (null when none)."""
    club = _resolve_club(token, db)
    s = club.settings
    extra = (s.extra if s else None) or {}
    if isinstance(extra, str):
        extra = json.loads(extra)
    evening = _active_evening(club, db)
    throw_tracking = extra.get("throw_tracking_enabled", True) is not False

    return {
        "club": {
            "name": club.name,
            "logo_url": s.logo_url if s else None,
            "primary_color": (s.primary_color if s else None) or "#e8a020",
            "secondary_color": (s.secondary_color if s else None) or "#6b7c5a",
        },
        "throw_tracking": throw_tracking,
        "evening": _serialize_evening(evening, throw_tracking) if evening else None,
    }


@router.get("/{token}/events", include_in_schema=False)
async def stream_scoreboard_events(token: str, db: Session = Depends(get_db)):
    """SSE stream for the TV — pushes 'updated' whenever the running evening changes.

    Reuses the same in-memory `event_bus` the authenticated evening stream publishes to. The
    subscription is bound to the evening that is open *right now*: an evening starting or ending is
    not an event on that bus, so the client also polls on a slow interval and re-opens this stream
    when the evening it is watching changes.

    The DB session is closed explicitly before the stream begins so a connected TV doesn't hold a
    pool connection for hours (`get_db`'s own `finally: db.close()` is then a no-op).
    """
    club = _resolve_club(token, db)
    evening = _active_evening(club, db)
    evening_id = evening.id if evening else None
    db.close()

    async def event_stream():
        q = event_bus.subscribe(evening_id) if evening_id is not None else None
        try:
            yield "data: connected\n\n"
            while True:
                if q is None:
                    # No evening to subscribe to — keep the connection alive so the client's
                    # reconnect logic stays quiet; its polling picks up the next evening start.
                    await asyncio.sleep(25)
                    yield ": heartbeat\n\n"
                    continue
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=25)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if q is not None:
                event_bus.unsubscribe(evening_id, q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

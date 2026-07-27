"""
Tests for the public TV/beamer scoreboard (#74):
  GET /scoreboard/{token}         — read-only payload, authenticated by secret token only
  GET /scoreboard/{token}/events  — SSE (resolution path only; the stream itself is long-lived)

The whole point of this surface is that it needs no login, so most tests here call it with no
Authorization header at all.
"""
from datetime import datetime, UTC

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.club import Club, ClubSettings
from models.drink import DrinkRound, DrinkType
from models.evening import Evening, EveningHighlight, EveningPlayer, RegularMember, Team
from models.game import Game, GameThrowLog
from models.penalty import PenaltyLog, PenaltyMode

TOKEN = "tv-token-abc"


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    eids = [e.id for e in db.query(Evening).filter(Evening.club_id == club.id).all()]
    if eids:
        gids = [g.id for g in db.query(Game).filter(Game.evening_id.in_(eids)).all()]
        if gids:
            db.query(GameThrowLog).filter(GameThrowLog.game_id.in_(gids)).delete(synchronize_session=False)
        db.query(Game).filter(Game.evening_id.in_(eids)).delete(synchronize_session=False)
        db.query(PenaltyLog).filter(PenaltyLog.evening_id.in_(eids)).delete(synchronize_session=False)
        db.query(DrinkRound).filter(DrinkRound.evening_id.in_(eids)).delete(synchronize_session=False)
        db.query(EveningHighlight).filter(EveningHighlight.evening_id.in_(eids)).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id.in_(eids)).delete(synchronize_session=False)
        db.query(Team).filter(Team.evening_id.in_(eids)).delete(synchronize_session=False)
        db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def settings(db: Session, club: Club) -> ClubSettings:
    s = ClubSettings(club_id=club.id, primary_color="#123456", secondary_color="#abcdef",
                     logo_url="/uploads/logos/x.png", extra={"scoreboard_token": TOKEN})
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture()
def evening(db: Session, club: Club, settings) -> Evening:
    e = Evening(club_id=club.id, date=datetime(2026, 3, 15, 20, 0), venue="Kegelstube")
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _player(db: Session, evening: Evening, name: str, nickname: str | None = None,
            club_id: int | None = None, team_id: int | None = None, is_king: bool = False) -> EveningPlayer:
    rm = None
    if nickname is not None:
        rm = RegularMember(club_id=club_id or evening.club_id, name=name, nickname=nickname)
        db.add(rm)
        db.commit()
        db.refresh(rm)
    p = EveningPlayer(evening_id=evening.id, name=name, team_id=team_id, is_king=is_king,
                      regular_member_id=rm.id if rm else None)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _penalty(db: Session, evening: Evening, player: EveningPlayer, amount: float,
             mode=PenaltyMode.euro, unit_amount=None, is_deleted: bool = False) -> PenaltyLog:
    l = PenaltyLog(evening_id=evening.id, player_id=player.id, player_name=player.name,
                   penalty_type_name="Pudel", icon="🎯", amount=amount, mode=mode,
                   unit_amount=unit_amount, client_timestamp=1.0, is_deleted=is_deleted)
    db.add(l)
    db.commit()
    return l


# ── token resolution ──────────────────────────────────────────────────────────

def test_unknown_token_404(client: TestClient, settings):
    assert client.get("/api/v1/scoreboard/nope").status_code == 404


def test_empty_token_does_not_match_club_without_token(client: TestClient, db: Session, club: Club):
    """A club whose settings have no scoreboard token must not be matched by a blank one."""
    db.add(ClubSettings(club_id=club.id, extra={}))
    db.commit()
    assert client.get("/api/v1/scoreboard/ ").status_code == 404


def test_needs_no_authentication(client: TestClient, settings):
    r = client.get(f"/api/v1/scoreboard/{TOKEN}")
    assert r.status_code == 200
    assert r.json()["club"]["name"] == "Test Club"


def test_serves_club_branding(client: TestClient, settings):
    club = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["club"]
    assert club["primary_color"] == "#123456"
    assert club["secondary_color"] == "#abcdef"
    assert club["logo_url"] == "/uploads/logos/x.png"


def test_payload_carries_no_member_records(client: TestClient, settings, evening, db):
    """The link is public — nothing beyond what's on the board in the club room."""
    body = client.get(f"/api/v1/scoreboard/{TOKEN}").text
    assert "email" not in body and "balance" not in body


# ── evening resolution ────────────────────────────────────────────────────────

def test_no_active_evening(client: TestClient, settings):
    assert client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"] is None


def test_closed_evening_is_not_active(client: TestClient, settings, evening, db: Session):
    evening.is_closed = True
    db.commit()
    assert client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"] is None


def test_active_evening_basics(client: TestClient, settings, evening, db: Session):
    _player(db, evening, "Hans")
    _player(db, evening, "Grete")
    ev = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]
    assert ev["id"] == evening.id
    assert ev["venue"] == "Kegelstube"
    assert ev["player_count"] == 2


# ── running game ──────────────────────────────────────────────────────────────

def test_running_game_active_and_next_player(client: TestClient, settings, evening, db: Session):
    t1 = Team(evening_id=evening.id, name="A")
    t2 = Team(evening_id=evening.id, name="B")
    db.add_all([t1, t2])
    db.commit()
    a = _player(db, evening, "Hans", team_id=t1.id)
    b = _player(db, evening, "Grete", team_id=t2.id)
    g = Game(evening_id=evening.id, name="Schere", status="running", client_timestamp=1.0,
             turn_mode="alternating", active_player_id=a.id)
    db.add(g)
    db.commit()

    game = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]["game"]
    assert game["name"] == "Schere"
    assert game["active_player"]["id"] == a.id
    assert game["next_player"]["id"] == b.id


def test_next_player_wraps_around(client: TestClient, settings, evening, db: Session):
    a = _player(db, evening, "Hans")
    b = _player(db, evening, "Grete")
    g = Game(evening_id=evening.id, name="Schere", status="running", client_timestamp=1.0,
             active_player_id=b.id)
    db.add(g)
    db.commit()
    game = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]["game"]
    assert game["next_player"]["id"] == a.id


def test_open_game_is_not_the_running_game(client: TestClient, settings, evening, db: Session):
    db.add(Game(evening_id=evening.id, name="Offen", status="open", client_timestamp=1.0))
    db.commit()
    assert client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]["game"] is None


def test_throws_and_standings(client: TestClient, settings, evening, db: Session):
    a = _player(db, evening, "Hans", nickname="Kegel-Hans")
    b = _player(db, evening, "Grete")
    g = Game(evening_id=evening.id, name="Schere", status="running", client_timestamp=1.0)
    db.add(g)
    db.commit()
    db.add_all([
        GameThrowLog(game_id=g.id, throw_num=1, pins=9, player_id=a.id),
        GameThrowLog(game_id=g.id, throw_num=2, pins=4, player_id=b.id),
        GameThrowLog(game_id=g.id, throw_num=3, pins=3, player_id=a.id),
    ])
    db.commit()

    game = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]["game"]
    assert [t["throw_num"] for t in game["throws"]] == [1, 2, 3]
    # Kegelname wins over the denormalized evening-player name
    assert game["throws"][0]["player_name"] == "Kegel-Hans"
    assert game["standings"][0] == {"player_id": a.id, "name": "Kegel-Hans", "pins": 12, "throws": 2}
    assert game["standings"][1]["pins"] == 4


def test_throw_tracking_disabled_hides_throws(client: TestClient, settings, evening, db: Session):
    settings.extra = {**settings.extra, "throw_tracking_enabled": False}
    db.commit()
    a = _player(db, evening, "Hans")
    g = Game(evening_id=evening.id, name="Schere", status="running", client_timestamp=1.0,
             active_player_id=a.id)
    db.add(g)
    db.commit()
    db.add(GameThrowLog(game_id=g.id, throw_num=1, pins=9, player_id=a.id))
    db.commit()

    body = client.get(f"/api/v1/scoreboard/{TOKEN}").json()
    assert body["throw_tracking"] is False
    assert body["evening"]["game"]["throws"] == []
    assert body["evening"]["game"]["standings"] == []
    # Everything that isn't throw-based still shows
    assert body["evening"]["game"]["active_player"]["id"] == a.id


def test_last_result_from_finished_game(client: TestClient, settings, evening, db: Session):
    db.add_all([
        Game(evening_id=evening.id, name="Erstes", status="finished", client_timestamp=1.0,
             winner_name="Hans", finished_at=datetime(2026, 3, 15, 20, 30, tzinfo=UTC), sort_order=1),
        Game(evening_id=evening.id, name="Zweites", status="finished", client_timestamp=2.0,
             winner_name="Grete", finished_at=datetime(2026, 3, 15, 21, 30, tzinfo=UTC), sort_order=2),
    ])
    db.commit()
    ev = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]
    assert ev["last_result"] == {"name": "Zweites", "winner_name": "Grete"}
    assert ev["totals"]["games_finished"] == 2


def test_deleted_game_excluded(client: TestClient, settings, evening, db: Session):
    db.add(Game(evening_id=evening.id, name="Weg", status="running", client_timestamp=1.0, is_deleted=True))
    db.commit()
    ev = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]
    assert ev["game"] is None
    assert ev["totals"]["games_total"] == 0


# ── penalties, drinks, king, highlight ────────────────────────────────────────

def test_penalty_ranking_sorted_and_counts_count_mode(client: TestClient, settings, evening, db: Session):
    a = _player(db, evening, "Hans", nickname="Kegel-Hans")
    b = _player(db, evening, "Grete")
    _penalty(db, evening, a, 2.5)
    _penalty(db, evening, b, 3.0, mode=PenaltyMode.count, unit_amount=2.0)  # 3 × 2 € = 6 €
    ev = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]
    assert ev["penalty_ranking"] == [
        {"name": "Grete", "amount": 6.0},
        {"name": "Kegel-Hans", "amount": 2.5},
    ]
    assert ev["totals"]["penalty_euro"] == 8.5


def test_deleted_penalty_excluded(client: TestClient, settings, evening, db: Session):
    a = _player(db, evening, "Hans")
    _penalty(db, evening, a, 5.0, is_deleted=True)
    ev = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]
    assert ev["penalty_ranking"] == []
    assert ev["totals"]["penalty_euro"] == 0


def test_absence_penalty_keeps_its_logged_name(client: TestClient, settings, evening, db: Session):
    """Absence entries have no evening player (player_id null) — the frozen name is all there is."""
    db.add(PenaltyLog(evening_id=evening.id, player_id=None, player_name="Abwesender",
                      penalty_type_name="Abwesenheit", amount=4.0, mode=PenaltyMode.euro,
                      client_timestamp=1.0))
    db.commit()
    ev = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]
    assert ev["penalty_ranking"] == [{"name": "Abwesender", "amount": 4.0}]


def test_drink_counters(client: TestClient, settings, evening, db: Session):
    a = _player(db, evening, "Hans")
    b = _player(db, evening, "Grete")
    db.add_all([
        DrinkRound(evening_id=evening.id, drink_type=DrinkType.beer, participant_ids=[a.id, b.id],
                   client_timestamp=1.0),
        DrinkRound(evening_id=evening.id, drink_type=DrinkType.beer, participant_ids=[a.id],
                   client_timestamp=2.0),
        DrinkRound(evening_id=evening.id, drink_type=DrinkType.shots, participant_ids=[a.id],
                   client_timestamp=3.0),
        DrinkRound(evening_id=evening.id, drink_type=DrinkType.beer, participant_ids=[a.id],
                   client_timestamp=4.0, is_deleted=True),
    ])
    db.commit()
    drinks = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]["drinks"]
    assert drinks["beer"] == 2 and drinks["shots"] == 1
    assert drinks["per_player"] == [{"name": "Hans", "count": 3}, {"name": "Grete", "count": 1}]


def test_king_and_highlight(client: TestClient, settings, evening, db: Session):
    _player(db, evening, "Hans", nickname="Kegel-Hans", is_king=True)
    db.add_all([
        EveningHighlight(evening_id=evening.id, text="Alt",
                         created_at=datetime(2026, 3, 15, 20, 0, tzinfo=UTC)),
        EveningHighlight(evening_id=evening.id, text="Neu", media_url="/uploads/media/p.jpg",
                         created_at=datetime(2026, 3, 15, 22, 0, tzinfo=UTC)),
    ])
    db.commit()
    ev = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]
    assert ev["king"] == {"name": "Kegel-Hans"}
    assert ev["highlight"]["text"] == "Neu"
    assert ev["highlight"]["media_url"] == "/uploads/media/p.jpg"


def test_no_king_no_highlight(client: TestClient, settings, evening, db: Session):
    _player(db, evening, "Hans")
    ev = client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"]
    assert ev["king"] is None and ev["highlight"] is None


# ── isolation ─────────────────────────────────────────────────────────────────

def test_other_clubs_evening_is_invisible(client: TestClient, settings, db: Session):
    other = Club(name="Other Club", slug="other-club")
    db.add(other)
    db.commit()
    db.add(Evening(club_id=other.id, date=datetime(2026, 3, 15, 20, 0), venue="Fremd"))
    db.commit()
    try:
        assert client.get(f"/api/v1/scoreboard/{TOKEN}").json()["evening"] is None
    finally:
        db.query(Evening).filter(Evening.club_id == other.id).delete(synchronize_session=False)
        db.delete(other)
        db.commit()


# ── SSE ───────────────────────────────────────────────────────────────────────

def test_events_rejects_unknown_token(client: TestClient, settings):
    assert client.get("/api/v1/scoreboard/nope/events").status_code == 404


# ── token plumbing on the club settings endpoints ─────────────────────────────

def test_club_settings_expose_and_lazily_create_the_token(client: TestClient, auth_headers, db: Session, club: Club):
    db.add(ClubSettings(club_id=club.id, extra={}))
    db.commit()
    token = client.get("/api/v1/club/", headers=auth_headers).json()["settings"]["scoreboard_token"]
    assert token
    # And it is the token the public endpoint answers to
    assert client.get(f"/api/v1/scoreboard/{token}").status_code == 200


def test_regenerate_requires_admin(client: TestClient, auth_headers, settings):
    assert client.post("/api/v1/club/settings/regenerate-scoreboard-token",
                       headers=auth_headers).status_code == 403


def test_regenerate_rotates_and_invalidates(client: TestClient, db: Session, club: Club, settings):
    from core.security import create_access_token, get_password_hash
    from models.user import User, UserRole
    admin = User(email="sbadmin@test.de", name="A", hashed_password=get_password_hash("x"),
                 role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(admin)
    db.commit()
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(admin.id)})}"}

    new_token = client.post("/api/v1/club/settings/regenerate-scoreboard-token",
                            headers=headers).json()["scoreboard_token"]
    assert new_token != TOKEN
    assert client.get(f"/api/v1/scoreboard/{new_token}").status_code == 200
    assert client.get(f"/api/v1/scoreboard/{TOKEN}").status_code == 404

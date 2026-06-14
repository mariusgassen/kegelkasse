"""
Tests for statistics endpoints:
  GET /stats/year/{year}  — club-wide yearly rollup
  GET /stats/me/{year}    — personal stats for current user
"""
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.drink import DrinkRound
from models.evening import Evening, EveningPlayer, RegularMember, Team
from models.game import Game, GameThrowLog
from models.penalty import PenaltyLog, PenaltyType
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    evenings = db.query(Evening).filter(Evening.club_id == club.id).all()
    for e in evenings:
        db.query(GameThrowLog).filter(GameThrowLog.game_id.in_(
            db.query(Game.id).filter(Game.evening_id == e.id)
        )).delete(synchronize_session=False)
        db.query(PenaltyLog).filter(PenaltyLog.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).delete(synchronize_session=False)
        db.query(DrinkRound).filter(DrinkRound.evening_id == e.id).delete(synchronize_session=False)
        db.query(Game).filter(Game.evening_id == e.id).delete(synchronize_session=False)
        db.query(Team).filter(Team.evening_id == e.id).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def member(db: Session, club: Club) -> RegularMember:
    rm = RegularMember(club_id=club.id, name="Stats Member", nickname="Statsy", is_active=True)
    db.add(rm)
    db.commit()
    db.refresh(rm)
    return rm


@pytest.fixture()
def member_user(db: Session, club: Club, member: RegularMember) -> User:
    u = User(
        email="stats@test.de",
        name="Stats User",
        hashed_password=get_password_hash("pass"),
        role=UserRole.member,
        club_id=club.id,
        is_active=True,
        regular_member_id=member.id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def member_headers(member_user: User) -> dict:
    token = create_access_token({"sub": str(member_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def evening_2025(db: Session, club: Club) -> Evening:
    from datetime import datetime
    e = Evening(club_id=club.id, date=datetime(2025, 6, 15), is_closed=True)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@pytest.fixture()
def player(db: Session, evening_2025: Evening, member: RegularMember) -> EveningPlayer:
    p = EveningPlayer(
        evening_id=evening_2025.id,
        regular_member_id=member.id,
        name=member.nickname or member.name,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


# ---------------------------------------------------------------------------
# GET /stats/year/{year}
# ---------------------------------------------------------------------------

class TestYearStats:
    def test_returns_structure(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["year"] == 2025
        assert "evening_count" in data
        assert "total_penalties" in data
        assert "total_beers" in data
        assert "players" in data

    def test_empty_year(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/year/1990", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["evening_count"] == 0
        assert data["players"] == []

    def test_counts_evening(self, client: TestClient, member_headers: dict,
                            evening_2025: Evening, player: EveningPlayer):
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        assert r.status_code == 200
        assert r.json()["evening_count"] == 1

    def test_counts_player_evening(self, client: TestClient, member_headers: dict,
                                   evening_2025: Evening, player: EveningPlayer, member: RegularMember):
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        players = r.json()["players"]
        assert any(p["regular_member_id"] == member.id for p in players)
        me = next(p for p in players if p["regular_member_id"] == member.id)
        assert me["evenings"] == 1

    def test_counts_penalties(self, client: TestClient, member_headers: dict,
                              db: Session,
                              evening_2025: Evening, player: EveningPlayer, member: RegularMember):
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id,
            player_id=player.id,
            player_name="Statsy",
            penalty_type_name="Test",
            amount=2.0,
            unit_amount=2.0,
            mode=PenaltyMode.euro,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        data = r.json()
        assert data["total_penalties"] == 2.0
        me = next(p for p in data["players"] if p["regular_member_id"] == member.id)
        assert me["penalty_total"] == 2.0
        assert me["penalty_count"] == 1

    def test_counts_count_mode_penalties(self, client: TestClient, member_headers: dict,
                                         db: Session,
                                         evening_2025: Evening, player: EveningPlayer,
                                         member: RegularMember):
        # Count-mode penalty value is count × unit_amount — it must be included in the
        # yearly rollup, not dropped like the old euro-only filter did.
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id,
            player_id=player.id,
            player_name="Statsy",
            penalty_type_name="Pumpe",
            amount=3.0,          # count of 3
            unit_amount=0.5,     # 0.50 € each → 1.50 € total
            mode=PenaltyMode.count,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        data = r.json()
        assert data["total_penalties"] == 1.5
        me = next(p for p in data["players"] if p["regular_member_id"] == member.id)
        assert me["penalty_total"] == 1.5
        assert me["penalty_count"] == 1

    def test_counts_beer_rounds(self, client: TestClient, member_headers: dict,
                                db: Session,
                                evening_2025: Evening, player: EveningPlayer, member: RegularMember):
        dr = DrinkRound(
            evening_id=evening_2025.id,
            drink_type="beer",
            participant_ids=[player.id],
            is_deleted=False,
            client_timestamp=time.time() * 1000,
        )
        db.add(dr)
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        data = r.json()
        assert data["total_beers"] == 1
        me = next(p for p in data["players"] if p["regular_member_id"] == member.id)
        assert me["beer_rounds"] == 1

    def test_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/stats/year/2025")
        assert r.status_code == 401

    def test_team_win_counts_for_each_member(self, client: TestClient, member_headers: dict,
                                             db: Session,
                                             evening_2025: Evening, player: EveningPlayer,
                                             member: RegularMember):
        # Member is part of the winning team — their game_wins must include the team win,
        # but the ranking must never expose the team itself as a player.
        from models.game import Game, WinnerType
        team = Team(evening_id=evening_2025.id, name="Winners")
        db.add(team)
        db.flush()
        player.team_id = team.id
        g = Game(
            evening_id=evening_2025.id,
            name="Team Win",
            winner_type=WinnerType.team,
            winner_ref=f"t:{team.id}",
            winner_name=team.name,
            status="finished",
            client_timestamp=time.time() * 1000,
        )
        db.add(g)
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        data = r.json()
        me = next(p for p in data["players"] if p["regular_member_id"] == member.id)
        assert me["game_wins"] == 1
        # Sanity: ranking entries always carry a regular_member_id or a guest_ prefixed key,
        # never a bare team name.
        assert all(p["name"] != team.name for p in data["players"])

    def test_deleted_penalties_excluded(self, client: TestClient, member_headers: dict,
                                        db: Session,
                                        evening_2025: Evening, player: EveningPlayer):
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id,
            player_id=player.id,
            player_name="Statsy",
            penalty_type_name="Del",
            amount=5.0,
            unit_amount=5.0,
            mode=PenaltyMode.euro,
            is_deleted=True,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        assert r.json()["total_penalties"] == 0.0

    def test_absence_penalty_attributed_to_member(self, client: TestClient, member_headers: dict,
                                                  db: Session, evening_2025: Evening,
                                                  member: RegularMember):
        # Absence penalties (player_id=None, regular_member_id set) belong to the member
        # even though they weren't a player that evening — they must show in the ranking.
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id,
            player_id=None,
            regular_member_id=member.id,
            player_name="Statsy",
            penalty_type_name="Abwesenheit",
            amount=5.0,
            mode=PenaltyMode.euro,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        data = r.json()
        assert data["total_penalties"] == 5.0
        me = next(p for p in data["players"] if p["regular_member_id"] == member.id)
        assert me["penalty_total"] == 5.0
        assert me["penalty_count"] == 1


# ---------------------------------------------------------------------------
# GET /stats/me/{year}
# ---------------------------------------------------------------------------

class TestMyStats:
    def test_returns_structure(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["year"] == 2025
        assert "penalty_total" in data
        assert "evenings_attended" in data
        assert "total_evenings" in data
        assert "game_wins" in data
        assert "beer_rounds" in data
        assert "avg_pins" in data

    def test_empty_year(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/me/1990", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["evenings_attended"] == 0
        assert data["penalty_total"] == 0.0

    def test_counts_attended(self, client: TestClient, member_headers: dict,
                             evening_2025: Evening, player: EveningPlayer):
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        assert r.json()["evenings_attended"] == 1
        assert r.json()["total_evenings"] == 1

    def test_counts_my_penalties(self, client: TestClient, member_headers: dict,
                                 db: Session,
                                 evening_2025: Evening, player: EveningPlayer):
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id,
            player_id=player.id,
            player_name="Statsy",
            penalty_type_name="Me",
            amount=3.0,
            unit_amount=3.0,
            mode=PenaltyMode.euro,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        assert r.json()["penalty_total"] == 3.0

    def test_counts_my_count_mode_penalties(self, client: TestClient, member_headers: dict,
                                            db: Session,
                                            evening_2025: Evening, player: EveningPlayer):
        # Count-mode penalty (count × unit_amount) must be included in personal stats.
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id,
            player_id=player.id,
            player_name="Statsy",
            penalty_type_name="Pumpe",
            amount=4.0,          # count of 4
            unit_amount=0.25,    # 0.25 € each → 1.00 € total
            mode=PenaltyMode.count,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        assert r.json()["penalty_total"] == 1.0

    def test_absence_penalty_in_my_total(self, client: TestClient, member_headers: dict,
                                        db: Session, evening_2025: Evening, member: RegularMember):
        # Absence penalty for an evening the member didn't play must still count.
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id,
            player_id=None,
            regular_member_id=member.id,
            player_name="Statsy",
            penalty_type_name="Abwesenheit",
            amount=5.0,
            mode=PenaltyMode.euro,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        assert r.json()["penalty_total"] == 5.0

    def test_game_win_counted(self, client: TestClient, member_headers: dict,
                              db: Session,
                              evening_2025: Evening, player: EveningPlayer):
        g = Game(
            evening_id=evening_2025.id,
            name="TestGame",
            status="finished",
            winner_ref=f"p:{player.id}",
            client_timestamp=time.time() * 1000,
        )
        db.add(g)
        db.commit()
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        assert r.json()["game_wins"] == 1

    def test_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/stats/me/2025")
        assert r.status_code == 401

    def test_user_without_member_link_returns_empty(self, client: TestClient,
                                                     db: Session, club: Club,
                                                     evening_2025: Evening, player: EveningPlayer):
        # User with no regular_member_id link
        u = User(
            email="nolink@test.de",
            name="No Link",
            hashed_password=get_password_hash("pass"),
            role=UserRole.member,
            club_id=club.id,
            is_active=True,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        token = create_access_token({"sub": str(u.id)})
        headers = {"Authorization": f"Bearer {token}"}
        r = client.get("/api/v1/stats/me/2025", headers=headers)
        assert r.status_code == 200
        assert r.json()["evenings_attended"] == 0
        db.delete(u)
        db.commit()

    def test_avg_pins_computed(self, client: TestClient, member_headers: dict,
                               db: Session,
                               evening_2025: Evening, player: EveningPlayer):
        g = Game(
            evening_id=evening_2025.id,
            name="ThrowGame",
            status="finished",
            client_timestamp=time.time() * 1000,
        )
        db.add(g)
        db.flush()
        db.add(GameThrowLog(game_id=g.id, player_id=player.id, throw_num=1, pins=7))
        db.add(GameThrowLog(game_id=g.id, player_id=player.id, throw_num=2, pins=9))
        db.commit()
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        data = r.json()
        assert data["throw_count"] == 2
        assert data["avg_pins"] == 8.0

    def test_counts_beer_rounds_in_me(self, client, member_headers, db,
                                      evening_2025, player, member):
        """Cover lines 120-121: beer round counting in /me/ endpoint."""
        dr = DrinkRound(
            evening_id=evening_2025.id,
            drink_type="beer",
            participant_ids=[player.id],
            is_deleted=False,
            client_timestamp=time.time() * 1000,
        )
        db.add(dr)
        db.commit()
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        assert r.json()["beer_rounds"] == 1

    def test_shot_rounds_not_in_beer(self, client, member_headers, db,
                                     evening_2025, player):
        """Shots don't count as beers in /me/ endpoint."""
        dr = DrinkRound(
            evening_id=evening_2025.id,
            drink_type="shots",
            participant_ids=[player.id],
            is_deleted=False,
            client_timestamp=time.time() * 1000,
        )
        db.add(dr)
        db.commit()
        r = client.get("/api/v1/stats/me/2025", headers=member_headers)
        assert r.json()["beer_rounds"] == 0


class TestYearStatsExtra:
    """Extra cases to cover year-stats throw counting and shot rounds (lines 45-57)."""

    def test_year_throws_counted(self, client, member_headers, db,
                                 evening_2025, player, member):
        """Cover lines 48-51: throw counting in /year/ endpoint."""
        g = Game(
            evening_id=evening_2025.id, name="YearThrow",
            status="finished", client_timestamp=time.time() * 1000,
        )
        db.add(g)
        db.flush()
        db.add(GameThrowLog(game_id=g.id, player_id=player.id, throw_num=1, pins=5))
        db.add(GameThrowLog(game_id=g.id, player_id=player.id, throw_num=2, pins=8))
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        me = next(p for p in r.json()["players"] if p["regular_member_id"] == member.id)
        assert me["throw_count"] == 2
        assert me["total_pins"] == 13
        assert me["avg_pins"] == 6.5

    def test_year_shot_rounds_counted(self, client, member_headers, db,
                                      evening_2025, player, member):
        """Cover line 57: shot_rounds counting in /year/ endpoint."""
        dr = DrinkRound(
            evening_id=evening_2025.id,
            drink_type="shots",
            participant_ids=[player.id],
            is_deleted=False,
            client_timestamp=time.time() * 1000,
        )
        db.add(dr)
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        me = next(p for p in r.json()["players"] if p["regular_member_id"] == member.id)
        assert me["shot_rounds"] == 1

    def test_year_total_shots_counted(self, client, member_headers, db,
                                      evening_2025, player):
        """Also cover total_shots in the year response."""
        dr = DrinkRound(
            evening_id=evening_2025.id,
            drink_type="shots",
            participant_ids=[player.id],
            is_deleted=False,
            client_timestamp=time.time() * 1000,
        )
        db.add(dr)
        db.commit()
        r = client.get("/api/v1/stats/year/2025", headers=member_headers)
        assert r.json()["total_shots"] == 1


# ---------------------------------------------------------------------------
# GET /stats/me/throws  +  GET /stats/members/{id}/throws
# ---------------------------------------------------------------------------

class TestThrowStats:
    def _make_game_with_throws(self, db, evening, player, pins_list):
        g = Game(
            evening_id=evening.id,
            name="ThrowGame",
            status="finished",
            client_timestamp=time.time() * 1000,
        )
        db.add(g)
        db.flush()
        for i, pins in enumerate(pins_list):
            db.add(GameThrowLog(game_id=g.id, player_id=player.id, throw_num=i + 1, pins=pins))
        db.commit()
        return g

    def test_me_throws_structure(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/me/throws?year=2025", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert "regular_member_id" in data
        assert "throw_count" in data
        assert "avg_pins" in data
        assert "best_avg" in data
        assert "worst_avg" in data
        assert "evenings" in data

    def test_me_throws_no_data(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/me/throws?year=1990", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["throw_count"] == 0
        assert data["avg_pins"] is None
        assert data["evenings"] == []

    def test_me_throws_counts_correctly(self, client: TestClient, member_headers: dict,
                                        db: Session,
                                        evening_2025: Evening, player: EveningPlayer):
        self._make_game_with_throws(db, evening_2025, player, [6, 8, 9])
        r = client.get("/api/v1/stats/me/throws?year=2025", headers=member_headers)
        data = r.json()
        assert data["throw_count"] == 3
        assert data["total_pins"] == 23
        assert data["avg_pins"] == round(23 / 3, 1)
        assert len(data["evenings"]) == 1
        ev = data["evenings"][0]
        assert ev["evening_id"] == evening_2025.id
        assert ev["throw_count"] == 3

    def test_me_throws_best_worst_avg(self, client: TestClient, member_headers: dict,
                                      db: Session,
                                      evening_2025: Evening, player: EveningPlayer, club: Club, member: RegularMember):
        """Two evenings → best and worst are different."""
        from datetime import datetime
        e2 = Evening(club_id=club.id, date=datetime(2025, 9, 1), is_closed=True)
        db.add(e2)
        db.flush()
        p2 = EveningPlayer(evening_id=e2.id, regular_member_id=member.id, name=member.name)
        db.add(p2)
        db.flush()
        self._make_game_with_throws(db, evening_2025, player, [9, 9])   # avg 9.0
        self._make_game_with_throws(db, e2, p2, [3, 3])                 # avg 3.0
        r = client.get("/api/v1/stats/me/throws?year=2025", headers=member_headers)
        data = r.json()
        assert data["best_avg"] == 9.0
        assert data["worst_avg"] == 3.0
        assert len(data["evenings"]) == 2

    def test_me_throws_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/stats/me/throws?year=2025")
        assert r.status_code == 401

    def test_me_throws_no_year_filter(self, client: TestClient, member_headers: dict,
                                      db: Session,
                                      evening_2025: Evening, player: EveningPlayer):
        """Without year param all evenings are returned."""
        self._make_game_with_throws(db, evening_2025, player, [5, 7])
        r = client.get("/api/v1/stats/me/throws", headers=member_headers)
        assert r.status_code == 200
        assert r.json()["throw_count"] == 2

    def test_member_throws_visible_to_club_member(self, client: TestClient, member_headers: dict,
                                                   db: Session,
                                                   evening_2025: Evening, player: EveningPlayer,
                                                   member: RegularMember):
        self._make_game_with_throws(db, evening_2025, player, [4, 8])
        r = client.get(f"/api/v1/stats/members/{member.id}/throws?year=2025", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["regular_member_id"] == member.id
        assert data["throw_count"] == 2

    def test_member_throws_404_for_wrong_club(self, client: TestClient, member_headers: dict,
                                               db: Session, club: Club):
        """Member from another club returns 404."""
        other_club = Club(name="Other", slug="other-stat")
        db.add(other_club)
        db.flush()
        other_member = RegularMember(club_id=other_club.id, name="Stranger", is_active=True)
        db.add(other_member)
        db.commit()
        r = client.get(f"/api/v1/stats/members/{other_member.id}/throws", headers=member_headers)
        assert r.status_code == 404
        db.delete(other_member)
        db.delete(other_club)
        db.commit()

    def test_member_throws_requires_auth(self, client: TestClient, member: RegularMember):
        r = client.get(f"/api/v1/stats/members/{member.id}/throws")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /stats/correlation/{year}
# ---------------------------------------------------------------------------

class TestCorrelationStats:
    def _add_penalty(self, db, evening, player, amount, ts_ms=None):
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening.id,
            player_id=player.id,
            player_name=player.name,
            penalty_type_name="X",
            amount=amount,
            unit_amount=amount,
            mode=PenaltyMode.euro,
            client_timestamp=ts_ms if ts_ms is not None else time.time() * 1000,
        )
        db.add(log)
        db.commit()
        return log

    def _add_drink(self, db, evening, player_ids, kind="beer", ts_ms=None):
        dr = DrinkRound(
            evening_id=evening.id,
            drink_type=kind,
            participant_ids=list(player_ids),
            is_deleted=False,
            client_timestamp=ts_ms if ts_ms is not None else time.time() * 1000,
        )
        db.add(dr)
        db.commit()
        return dr

    def test_returns_structure(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["year"] == 2025
        assert "overall_pearson_r" in data
        assert "evenings" in data
        assert "members" in data

    def test_empty_year(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/correlation/1990", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["overall_pearson_r"] is None
        assert data["evenings"] == []
        assert data["members"] == []

    def test_evening_point_sums(self, client: TestClient, member_headers: dict, db: Session,
                                evening_2025: Evening, player: EveningPlayer):
        self._add_penalty(db, evening_2025, player, 2.5)
        self._add_penalty(db, evening_2025, player, 1.0)
        self._add_drink(db, evening_2025, [player.id], "beer")
        self._add_drink(db, evening_2025, [player.id], "shots")
        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        data = r.json()
        assert len(data["evenings"]) == 1
        pt = data["evenings"][0]
        assert pt["penalty_euro"] == 3.5
        assert pt["drink_count"] == 2  # beer + shots combined

    def test_member_evening_points_present(self, client: TestClient, member_headers: dict, db: Session,
                                           evening_2025: Evening, player: EveningPlayer, member: RegularMember):
        self._add_penalty(db, evening_2025, player, 2.5)
        self._add_drink(db, evening_2025, [player.id], "beer")
        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        me = next(m for m in r.json()["members"] if m["regular_member_id"] == member.id)
        assert "evening_points" in me
        assert len(me["evening_points"]) == 1
        pt = me["evening_points"][0]
        assert pt["evening_id"] == evening_2025.id
        assert pt["penalty_euro"] == 2.5
        assert pt["drink_count"] == 1
        assert "date" in pt

    def test_member_totals_and_pairs(self, client: TestClient, member_headers: dict, db: Session,
                                     club: Club, member: RegularMember,
                                     evening_2025: Evening, player: EveningPlayer):
        from datetime import datetime
        # second evening
        e2 = Evening(club_id=club.id, date=datetime(2025, 7, 1), is_closed=True)
        db.add(e2)
        db.flush()
        p2 = EveningPlayer(evening_id=e2.id, regular_member_id=member.id, name=member.name)
        db.add(p2)
        db.commit()
        db.refresh(p2)
        # third evening
        e3 = Evening(club_id=club.id, date=datetime(2025, 8, 1), is_closed=True)
        db.add(e3)
        db.flush()
        p3 = EveningPlayer(evening_id=e3.id, regular_member_id=member.id, name=member.name)
        db.add(p3)
        db.commit()
        db.refresh(p3)

        self._add_penalty(db, evening_2025, player, 1.0)
        self._add_drink(db, evening_2025, [player.id])
        self._add_penalty(db, e2, p2, 2.0)
        self._add_drink(db, e2, [p2.id])
        self._add_drink(db, e2, [p2.id])
        self._add_penalty(db, e3, p3, 3.0)
        self._add_drink(db, e3, [p3.id])
        self._add_drink(db, e3, [p3.id])
        self._add_drink(db, e3, [p3.id])

        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        data = r.json()
        me = next(m for m in data["members"] if m["regular_member_id"] == member.id)
        assert me["total_penalty_euro"] == 6.0
        assert me["total_drink_count"] == 6
        assert me["evenings_count"] == 3
        # perfectly correlated → r = 1
        assert me["personal_pearson_r"] == 1.0

    def test_single_evening_member_r_null(self, client: TestClient, member_headers: dict, db: Session,
                                          evening_2025: Evening, player: EveningPlayer, member: RegularMember):
        self._add_penalty(db, evening_2025, player, 1.0)
        self._add_drink(db, evening_2025, [player.id])
        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        me = next(m for m in r.json()["members"] if m["regular_member_id"] == member.id)
        assert me["personal_pearson_r"] is None

    def test_zero_variance_drinks_r_null(self, client: TestClient, member_headers: dict, db: Session,
                                         club: Club, member: RegularMember,
                                         evening_2025: Evening, player: EveningPlayer):
        from datetime import datetime
        e2 = Evening(club_id=club.id, date=datetime(2025, 7, 1), is_closed=True)
        db.add(e2)
        db.flush()
        p2 = EveningPlayer(evening_id=e2.id, regular_member_id=member.id, name=member.name)
        db.add(p2)
        e3 = Evening(club_id=club.id, date=datetime(2025, 8, 1), is_closed=True)
        db.add(e3)
        db.flush()
        p3 = EveningPlayer(evening_id=e3.id, regular_member_id=member.id, name=member.name)
        db.add(p3)
        db.commit()
        # different penalties, all same drink count (1)
        self._add_penalty(db, evening_2025, player, 1.0)
        self._add_drink(db, evening_2025, [player.id])
        self._add_penalty(db, e2, p2, 2.0)
        self._add_drink(db, e2, [p2.id])
        self._add_penalty(db, e3, p3, 3.0)
        self._add_drink(db, e3, [p3.id])
        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        me = next(m for m in r.json()["members"] if m["regular_member_id"] == member.id)
        assert me["personal_pearson_r"] is None

    def test_deleted_excluded(self, client: TestClient, member_headers: dict, db: Session,
                              evening_2025: Evening, player: EveningPlayer):
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id, player_id=player.id, player_name="x",
            penalty_type_name="del", amount=5.0, unit_amount=5.0,
            mode=PenaltyMode.euro, is_deleted=True,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        assert r.json()["evenings"][0]["penalty_euro"] == 0.0

    def test_count_mode_penalties_included(self, client: TestClient, member_headers: dict, db: Session,
                                           evening_2025: Evening, player: EveningPlayer,
                                           member: RegularMember):
        """Year correlation evening/member rollup must include count-mode penalties
        (amount × unit_amount), matching the convention in evenings.py / treasury.py."""
        from models.penalty import PenaltyMode
        # 4 × €0.75 = €3.00 (count mode)
        log_count = PenaltyLog(
            evening_id=evening_2025.id, player_id=player.id, player_name=player.name,
            penalty_type_name="Niete", amount=4.0, unit_amount=0.75,
            mode=PenaltyMode.count, client_timestamp=time.time() * 1000,
        )
        # €2.00 (euro mode)
        log_euro = PenaltyLog(
            evening_id=evening_2025.id, player_id=player.id, player_name=player.name,
            penalty_type_name="Late", amount=2.0, unit_amount=2.0,
            mode=PenaltyMode.euro, client_timestamp=time.time() * 1000,
        )
        db.add_all([log_count, log_euro])
        db.commit()
        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        data = r.json()
        # Evening total: €3.00 + €2.00 = €5.00
        assert data["evenings"][0]["penalty_euro"] == pytest.approx(5.0)
        # Member rollup must reflect the same
        me = next(m for m in data["members"] if m["regular_member_id"] == member.id)
        assert me["total_penalty_euro"] == pytest.approx(5.0)
        assert me["evening_points"][0]["penalty_euro"] == pytest.approx(5.0)

    def test_per_player_averages_multi_player(
        self, client: TestClient, member_headers: dict, db: Session,
        club: Club, member: RegularMember, evening_2025: Evening, player: EveningPlayer,
    ):
        """Evening-level point uses per-player averages when multiple players are present."""
        # Add a second player to the same evening.
        member2 = RegularMember(club_id=club.id, name="Player Two")
        db.add(member2)
        db.flush()
        player2 = EveningPlayer(evening_id=evening_2025.id, regular_member_id=member2.id, name=member2.name)
        db.add(player2)
        db.commit()
        db.refresh(player2)

        # player: 2.0€ penalty, 2 drinks
        self._add_penalty(db, evening_2025, player, 2.0)
        self._add_drink(db, evening_2025, [player.id])
        self._add_drink(db, evening_2025, [player.id])
        # player2: 4.0€ penalty, 4 drinks
        self._add_penalty(db, evening_2025, player2, 4.0)
        self._add_drink(db, evening_2025, [player2.id])
        self._add_drink(db, evening_2025, [player2.id])
        self._add_drink(db, evening_2025, [player2.id])
        self._add_drink(db, evening_2025, [player2.id])

        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        pt = r.json()["evenings"][0]
        # Total: 6.0€ / 2 players = 3.0€; 6 drinks / 2 players = 3.0
        assert pt["penalty_euro"] == pytest.approx(3.0)
        assert pt["drink_count"] == pytest.approx(3.0)

    def test_absence_penalty_excluded_from_evening_point(
        self, client: TestClient, member_headers: dict, db: Session,
        club: Club, member: RegularMember, evening_2025: Evening, player: EveningPlayer,
    ):
        """Absence penalties (player_id=None) must not count toward the evening avg."""
        from models.penalty import PenaltyMode
        absent = RegularMember(club_id=club.id, name="Absent Member")
        db.add(absent)
        db.commit()
        # Absence penalty — no player_id
        absence_log = PenaltyLog(
            evening_id=evening_2025.id,
            player_id=None,
            regular_member_id=absent.id,
            player_name=absent.name,
            penalty_type_name="Abwesenheit",
            amount=5.0, unit_amount=5.0,
            mode=PenaltyMode.euro,
            client_timestamp=time.time() * 1000,
        )
        db.add(absence_log)
        # Normal penalty for the present player
        self._add_penalty(db, evening_2025, player, 2.0)
        db.commit()

        r = client.get("/api/v1/stats/correlation/2025", headers=member_headers)
        pt = r.json()["evenings"][0]
        # Only present-player penalty counted, averaged over 1 player
        assert pt["penalty_euro"] == pytest.approx(2.0)

    def test_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/stats/correlation/2025")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /stats/correlation/evening/{evening_id}
# ---------------------------------------------------------------------------

class TestEveningCorrelation:
    def _add_penalty(self, db, evening, player, amount, ts_ms):
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening.id, player_id=player.id,
            player_name=player.name, penalty_type_name="X",
            amount=amount, unit_amount=amount, mode=PenaltyMode.euro,
            client_timestamp=ts_ms,
        )
        db.add(log)
        db.commit()
        return log

    def _add_drink(self, db, evening, player_ids, ts_ms, kind="beer"):
        dr = DrinkRound(
            evening_id=evening.id, drink_type=kind,
            participant_ids=list(player_ids), is_deleted=False,
            client_timestamp=ts_ms,
        )
        db.add(dr)
        db.commit()
        return dr

    def test_returns_structure(self, client: TestClient, member_headers: dict,
                               evening_2025: Evening, player: EveningPlayer):
        r = client.get(f"/api/v1/stats/correlation/evening/{evening_2025.id}", headers=member_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["evening_id"] == evening_2025.id
        assert data["bin_minutes"] == 15
        assert "members" in data

    def test_bins_and_cumulative(self, client: TestClient, member_headers: dict, db: Session,
                                 evening_2025: Evening, player: EveningPlayer):
        # 5 bins of 15 min — events spread across them
        base = 1_700_000_000_000  # arbitrary fixed ms
        self._add_penalty(db, evening_2025, player, 1.0, base + 0)               # bin 0
        self._add_penalty(db, evening_2025, player, 2.0, base + 16 * 60_000)     # bin 1
        self._add_drink(db, evening_2025, [player.id], base + 17 * 60_000)       # bin 1
        self._add_penalty(db, evening_2025, player, 3.0, base + 32 * 60_000)     # bin 2
        self._add_drink(db, evening_2025, [player.id], base + 33 * 60_000)       # bin 2
        self._add_drink(db, evening_2025, [player.id], base + 49 * 60_000)       # bin 3
        r = client.get(
            f"/api/v1/stats/correlation/evening/{evening_2025.id}?bin_minutes=15",
            headers=member_headers,
        )
        data = r.json()
        me = next(m for m in data["members"] if m["evening_player_id"] == player.id)
        assert len(me["bins"]) >= 4
        # cumulative correctness
        assert me["bins"][-1]["cum_penalty"] == 6.0
        assert me["bins"][-1]["cum_drinks"] == 3
        # derivative r should be finite (penalties and drinks both vary)
        assert me["derivative_pearson_r"] is not None

    def test_empty_member_returns_no_bins(self, client: TestClient, member_headers: dict,
                                          evening_2025: Evening, player: EveningPlayer):
        # Player has no events
        r = client.get(f"/api/v1/stats/correlation/evening/{evening_2025.id}", headers=member_headers)
        me = next(m for m in r.json()["members"] if m["evening_player_id"] == player.id)
        assert me["bins"] == []
        assert me["derivative_pearson_r"] is None

    def test_only_penalties_no_drinks_zero_variance(self, client: TestClient, member_headers: dict,
                                                    db: Session,
                                                    evening_2025: Evening, player: EveningPlayer):
        base = 1_700_000_000_000
        self._add_penalty(db, evening_2025, player, 1.0, base + 0)
        self._add_penalty(db, evening_2025, player, 2.0, base + 16 * 60_000)
        self._add_penalty(db, evening_2025, player, 3.0, base + 32 * 60_000)
        r = client.get(f"/api/v1/stats/correlation/evening/{evening_2025.id}", headers=member_headers)
        me = next(m for m in r.json()["members"] if m["evening_player_id"] == player.id)
        assert me["derivative_pearson_r"] is None  # zero variance on drinks

    def test_bin_minutes_validation(self, client: TestClient, member_headers: dict,
                                    evening_2025: Evening):
        r = client.get(
            f"/api/v1/stats/correlation/evening/{evening_2025.id}?bin_minutes=1",
            headers=member_headers,
        )
        assert r.status_code == 422
        r = client.get(
            f"/api/v1/stats/correlation/evening/{evening_2025.id}?bin_minutes=120",
            headers=member_headers,
        )
        assert r.status_code == 422

    def test_deleted_events_excluded(self, client: TestClient, member_headers: dict, db: Session,
                                     evening_2025: Evening, player: EveningPlayer):
        from models.penalty import PenaltyMode
        log = PenaltyLog(
            evening_id=evening_2025.id, player_id=player.id, player_name="x",
            penalty_type_name="del", amount=99.0, unit_amount=99.0,
            mode=PenaltyMode.euro, is_deleted=True,
            client_timestamp=1_700_000_000_000,
        )
        db.add(log)
        dr = DrinkRound(
            evening_id=evening_2025.id, drink_type="beer",
            participant_ids=[player.id], is_deleted=True,
            client_timestamp=1_700_000_000_000,
        )
        db.add(dr)
        db.commit()
        r = client.get(f"/api/v1/stats/correlation/evening/{evening_2025.id}", headers=member_headers)
        me = next(m for m in r.json()["members"] if m["evening_player_id"] == player.id)
        assert me["bins"] == []

    def test_count_mode_penalties_included(self, client: TestClient, member_headers: dict, db: Session,
                                           evening_2025: Evening, player: EveningPlayer):
        """Count-mode penalties (amount × unit_amount) must contribute to per-bin Δpenalty,
        matching the convention used by every other view in the app. Regression for #267."""
        from models.penalty import PenaltyMode
        base = 1_700_000_000_000
        # 3 × €0.50 = €1.50 (count mode)
        log = PenaltyLog(
            evening_id=evening_2025.id, player_id=player.id, player_name=player.name,
            penalty_type_name="Niete", amount=3.0, unit_amount=0.5,
            mode=PenaltyMode.count, client_timestamp=base,
        )
        db.add(log)
        # 1 × €2.00 (euro mode)
        self._add_penalty(db, evening_2025, player, 2.0, base + 60_000)
        # need a drink in a different bin so the bin grid has more than one cell
        self._add_drink(db, evening_2025, [player.id], base + 16 * 60_000)
        db.commit()

        r = client.get(f"/api/v1/stats/correlation/evening/{evening_2025.id}", headers=member_headers)
        assert r.status_code == 200
        me = next(m for m in r.json()["members"] if m["evening_player_id"] == player.id)
        # Sum across bins should equal €1.50 + €2.00 = €3.50
        total = sum(b["delta_penalty"] for b in me["bins"])
        assert total == pytest.approx(3.5)
        assert me["bins"][-1]["cum_penalty"] == pytest.approx(3.5)

    def test_404_unknown_evening(self, client: TestClient, member_headers: dict):
        r = client.get("/api/v1/stats/correlation/evening/999999", headers=member_headers)
        assert r.status_code == 404

    def test_403_other_club(self, client: TestClient, member_headers: dict, db: Session, club: Club):
        from datetime import datetime
        other = Club(name="OtherC", slug="other-corr")
        db.add(other)
        db.flush()
        e_other = Evening(club_id=other.id, date=datetime(2025, 1, 1))
        db.add(e_other)
        db.commit()
        r = client.get(f"/api/v1/stats/correlation/evening/{e_other.id}", headers=member_headers)
        assert r.status_code == 403
        db.delete(e_other)
        db.delete(other)
        db.commit()

    def test_requires_auth(self, client: TestClient, evening_2025: Evening):
        r = client.get(f"/api/v1/stats/correlation/evening/{evening_2025.id}")
        assert r.status_code == 401

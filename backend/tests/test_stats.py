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
from models.evening import Evening, EveningPlayer, RegularMember
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

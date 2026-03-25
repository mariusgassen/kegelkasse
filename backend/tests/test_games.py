"""Tests for game, drink, and stats endpoints."""
import time
import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.user import User, UserRole
from models.evening import Evening, EveningPlayer, RegularMember
from models.penalty import PenaltyLog
from models.game import Game
from models.drink import DrinkRound
from datetime import datetime, UTC


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db, club):
    u = User(
        email="gameadmin@test.de",
        name="Game Admin",
        username="gameadmin",
        hashed_password=get_password_hash("adminpass"),
        role=UserRole.admin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def admin_headers(admin_user):
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def regular_member(db, club):
    m = RegularMember(club_id=club.id, name="Hans Kegel", nickname="Kegel-Hans")
    db.add(m)
    db.commit()
    db.refresh(m)
    yield m
    # No explicit teardown — cleanup_evenings handles deletion


@pytest.fixture()
def evening(db, club, admin_user):
    e = Evening(
        club_id=club.id,
        date=datetime(2025, 6, 15, 20, 0),
        venue="Testgasse",
        created_by=admin_user.id,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    yield e


@pytest.fixture()
def player(db, evening, regular_member):
    p = EveningPlayer(
        evening_id=evening.id,
        name="Hans Kegel",
        regular_member_id=regular_member.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    yield p


@pytest.fixture()
def player2(db, evening):
    p = EveningPlayer(
        evening_id=evening.id,
        name="Guest Player",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    yield p


@pytest.fixture(autouse=True)
def cleanup_evenings(db, club):
    """Runs before club fixture teardown — clears all evening-related data and members."""
    yield
    db.query(PenaltyLog).delete(synchronize_session=False)
    db.query(DrinkRound).delete(synchronize_session=False)
    db.query(Game).delete(synchronize_session=False)
    db.query(EveningPlayer).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


def _ts():
    return time.time() * 1000


# ---------------------------------------------------------------------------
# POST /api/v1/evening/{eid}/games — create game
# ---------------------------------------------------------------------------

class TestCreateGame:
    def test_member_can_create_game(self, client: TestClient, evening, user, auth_headers):
        resp = client.post(f"/api/v1/evening/{evening.id}/games", json={
            "name": "Große Hausnummer",
            "is_opener": True,
            "winner_type": "individual",
            "loser_penalty": 1.5,
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Große Hausnummer"
        assert "id" in data

    def test_game_appears_in_evening_detail(self, client: TestClient, evening, user, auth_headers):
        client.post(f"/api/v1/evening/{evening.id}/games", json={
            "name": "Test Game",
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        resp = client.get(f"/api/v1/evening/{evening.id}", headers=auth_headers)
        assert resp.status_code == 200
        games = resp.json()["games"]
        assert any(g["name"] == "Test Game" for g in games)

    def test_requires_auth(self, client: TestClient, evening):
        resp = client.post(f"/api/v1/evening/{evening.id}/games", json={
            "name": "No Auth Game",
            "client_timestamp": _ts(),
        })
        assert resp.status_code == 401

    def test_wrong_club_evening_returns_404(self, client: TestClient, db, club, admin_user, auth_headers):
        from models.club import Club
        other_club = Club(name="Other Club", slug="other-club")
        db.add(other_club)
        db.commit()
        other_evening = Evening(club_id=other_club.id, date=datetime.now(UTC), created_by=admin_user.id)
        db.add(other_evening)
        db.commit()
        try:
            resp = client.post(f"/api/v1/evening/{other_evening.id}/games", json={
                "name": "Sneaky Game",
                "client_timestamp": _ts(),
            }, headers=auth_headers)
            assert resp.status_code == 404
        finally:
            db.query(Evening).filter(Evening.id == other_evening.id).delete(synchronize_session=False)
            db.query(Club).filter(Club.id == other_club.id).delete(synchronize_session=False)
            db.commit()


# ---------------------------------------------------------------------------
# POST /api/v1/evening/{eid}/games/{gid}/start
# ---------------------------------------------------------------------------

class TestStartGame:
    def _create_game(self, client, evening, headers):
        r = client.post(f"/api/v1/evening/{evening.id}/games", json={
            "name": "Start Test Game",
            "client_timestamp": _ts(),
        }, headers=headers)
        return r.json()["id"]

    def test_start_open_game(self, client: TestClient, db, evening, user, auth_headers):
        gid = self._create_game(client, evening, auth_headers)
        resp = client.post(f"/api/v1/evening/{evening.id}/games/{gid}/start", headers=auth_headers)
        assert resp.status_code == 200
        game = db.query(Game).filter(Game.id == gid).first()
        assert game.status == "running"
        assert game.started_at is not None

    def test_cannot_start_already_running_game(self, client: TestClient, evening, user, auth_headers):
        gid = self._create_game(client, evening, auth_headers)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/start", headers=auth_headers)
        resp = client.post(f"/api/v1/evening/{evening.id}/games/{gid}/start", headers=auth_headers)
        assert resp.status_code == 400

    def test_start_nonexistent_game(self, client: TestClient, evening, auth_headers):
        resp = client.post(f"/api/v1/evening/{evening.id}/games/99999/start", headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/evening/{eid}/games/{gid}/finish
# ---------------------------------------------------------------------------

class TestFinishGame:
    def _create_and_start_game(self, client, evening, headers, is_opener=False, loser_penalty=0.0):
        r = client.post(f"/api/v1/evening/{evening.id}/games", json={
            "name": "Finish Test Game",
            "is_opener": is_opener,
            "loser_penalty": loser_penalty,
            "client_timestamp": _ts(),
        }, headers=headers)
        gid = r.json()["id"]
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/start", headers=headers)
        return gid

    def test_finish_game_with_winner(self, client: TestClient, db, evening, player, user, auth_headers):
        gid = self._create_and_start_game(client, evening, auth_headers)
        resp = client.post(f"/api/v1/evening/{evening.id}/games/{gid}/finish", json={
            "winner_ref": f"p:{player.id}",
            "winner_name": player.name,
            "scores": {f"p:{player.id}": 100},
        }, headers=auth_headers)
        assert resp.status_code == 200
        game = db.query(Game).filter(Game.id == gid).first()
        assert game.status == "finished"
        assert game.winner_ref == f"p:{player.id}"
        assert game.finished_at is not None

    def test_opener_game_sets_king_flag(self, client: TestClient, db, evening, player, player2, user, auth_headers):
        gid = self._create_and_start_game(client, evening, auth_headers, is_opener=True)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/finish", json={
            "winner_ref": f"p:{player.id}",
            "winner_name": player.name,
            "scores": {},
        }, headers=auth_headers)
        db.refresh(player)
        db.refresh(player2)
        assert player.is_king is True
        assert player2.is_king is False

    def test_loser_penalty_created(self, client: TestClient, db, evening, player, player2, user, auth_headers):
        gid = self._create_and_start_game(client, evening, auth_headers, loser_penalty=2.0)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/finish", json={
            "winner_ref": f"p:{player.id}",
            "winner_name": player.name,
            "scores": {f"p:{player.id}": 100, f"p:{player2.id}": 80},
            "loser_penalty": 2.0,
        }, headers=auth_headers)
        penalty = db.query(PenaltyLog).filter(
            PenaltyLog.game_id == gid,
            PenaltyLog.player_id == player2.id,
        ).first()
        assert penalty is not None
        assert penalty.amount == 2.0

    def test_finish_nonexistent_game(self, client: TestClient, evening, auth_headers):
        resp = client.post(f"/api/v1/evening/{evening.id}/games/99999/finish", json={
            "winner_ref": "p:1",
            "winner_name": "Nobody",
            "scores": {},
        }, headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /api/v1/evening/{eid}/games/{gid}
# ---------------------------------------------------------------------------

class TestUpdateGame:
    def test_update_game_name(self, client: TestClient, db, evening, user, auth_headers):
        r = client.post(f"/api/v1/evening/{evening.id}/games", json={
            "name": "Original Name",
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        gid = r.json()["id"]
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/{gid}", json={"name": "Updated Name"}, headers=auth_headers)
        assert resp.status_code == 200
        game = db.query(Game).filter(Game.id == gid).first()
        assert game.name == "Updated Name"

    def test_update_nonexistent_game(self, client: TestClient, evening, auth_headers):
        resp = client.patch(f"/api/v1/evening/{evening.id}/games/99999", json={"name": "X"}, headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/v1/evening/{eid}/games/{gid}
# ---------------------------------------------------------------------------

class TestDeleteGame:
    def test_soft_delete_game(self, client: TestClient, db, evening, user, auth_headers):
        r = client.post(f"/api/v1/evening/{evening.id}/games", json={
            "name": "To Delete",
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        gid = r.json()["id"]
        resp = client.delete(f"/api/v1/evening/{evening.id}/games/{gid}", headers=auth_headers)
        assert resp.status_code == 200
        game = db.query(Game).filter(Game.id == gid).first()
        assert game.is_deleted is True

    def test_delete_game_also_soft_deletes_penalties(self, client: TestClient, db, evening, player, player2, user, auth_headers):
        r = client.post(f"/api/v1/evening/{evening.id}/games", json={
            "name": "Penalty Game",
            "loser_penalty": 3.0,
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        gid = r.json()["id"]
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/start", headers=auth_headers)
        client.post(f"/api/v1/evening/{evening.id}/games/{gid}/finish", json={
            "winner_ref": f"p:{player.id}",
            "winner_name": player.name,
            "scores": {f"p:{player.id}": 100, f"p:{player2.id}": 80},
            "loser_penalty": 3.0,
        }, headers=auth_headers)
        client.delete(f"/api/v1/evening/{evening.id}/games/{gid}", headers=auth_headers)
        penalties = db.query(PenaltyLog).filter(PenaltyLog.game_id == gid).all()
        assert all(p.is_deleted for p in penalties)


# ---------------------------------------------------------------------------
# POST /api/v1/evening/{eid}/drinks
# ---------------------------------------------------------------------------

class TestAddDrinkRound:
    def test_add_beer_round(self, client: TestClient, evening, player, player2, user, auth_headers):
        resp = client.post(f"/api/v1/evening/{evening.id}/drinks", json={
            "drink_type": "beer",
            "participant_ids": [player.id, player2.id],
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["drink_type"] == "beer"
        assert "id" in data

    def test_add_shots_round(self, client: TestClient, evening, player, user, auth_headers):
        resp = client.post(f"/api/v1/evening/{evening.id}/drinks", json={
            "drink_type": "shots",
            "participant_ids": [player.id],
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        assert resp.status_code == 200

    def test_drink_appears_in_evening_detail(self, client: TestClient, evening, player, user, auth_headers):
        client.post(f"/api/v1/evening/{evening.id}/drinks", json={
            "drink_type": "beer",
            "participant_ids": [player.id],
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        resp = client.get(f"/api/v1/evening/{evening.id}", headers=auth_headers)
        drinks = resp.json()["drink_rounds"]
        assert len(drinks) > 0

    def test_requires_auth(self, client: TestClient, evening, player):
        resp = client.post(f"/api/v1/evening/{evening.id}/drinks", json={
            "drink_type": "beer",
            "participant_ids": [player.id],
            "client_timestamp": _ts(),
        })
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/evening/{eid}/drinks/{rid}
# ---------------------------------------------------------------------------

class TestDeleteDrinkRound:
    def test_soft_delete_drink(self, client: TestClient, db, evening, player, user, auth_headers):
        r = client.post(f"/api/v1/evening/{evening.id}/drinks", json={
            "drink_type": "beer",
            "participant_ids": [player.id],
            "client_timestamp": _ts(),
        }, headers=auth_headers)
        rid = r.json()["id"]
        resp = client.delete(f"/api/v1/evening/{evening.id}/drinks/{rid}", headers=auth_headers)
        assert resp.status_code == 200
        drink = db.query(DrinkRound).filter(DrinkRound.id == rid).first()
        assert drink.is_deleted is True


# ---------------------------------------------------------------------------
# GET /api/v1/stats/year/{year}
# ---------------------------------------------------------------------------

class TestYearStats:
    def test_empty_year_returns_structure(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/stats/year/2025", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["year"] == 2025
        assert data["evening_count"] == 0
        assert data["total_penalties"] == 0
        assert data["players"] == []

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/stats/year/2025")
        assert resp.status_code == 401

    def test_counts_evenings_for_club(self, client: TestClient, evening, user, auth_headers):
        # evening fixture is 2025-06-15, so year 2025 should have 1 evening
        resp = client.get("/api/v1/stats/year/2025", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["evening_count"] == 1

    def test_does_not_count_other_years(self, client: TestClient, evening, user, auth_headers):
        resp = client.get("/api/v1/stats/year/2024", headers=auth_headers)
        assert resp.json()["evening_count"] == 0


# ---------------------------------------------------------------------------
# GET /api/v1/stats/me/{year}
# ---------------------------------------------------------------------------

class TestMyStats:
    def test_empty_stats(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/stats/me/2025", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["year"] == 2025
        assert data["evenings_attended"] == 0
        assert data["penalty_total"] == 0.0
        assert data["game_wins"] == 0

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/stats/me/2025")
        assert resp.status_code == 401

    def test_counts_attended_evenings(self, client: TestClient, db, evening, user, regular_member, auth_headers):
        user.regular_member_id = regular_member.id
        db.commit()
        p = EveningPlayer(
            evening_id=evening.id,
            name=regular_member.name,
            regular_member_id=regular_member.id,
        )
        db.add(p)
        db.commit()
        resp = client.get("/api/v1/stats/me/2025", headers=auth_headers)
        assert resp.json()["evenings_attended"] == 1
        user.regular_member_id = None
        db.commit()

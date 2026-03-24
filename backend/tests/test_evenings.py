"""
Tests for evening management endpoints:
  GET    /evening/           — list evenings
  POST   /evening/           — create evening (admin only)
  GET    /evening/{eid}      — get evening detail
  PATCH  /evening/{eid}      — update/close evening
  POST   /evening/{eid}/players    — add player
  DELETE /evening/{eid}/players/{pid} — remove player
  POST   /evening/{eid}/penalties  — log penalty
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.evening import Evening, EveningPlayer, RegularMember
from models.penalty import PenaltyType, PenaltyLog
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup_evenings(db: Session, club: Club):
    """Delete all evenings (and their sub-objects) for the test club after each test,
    so the conftest `club` teardown can delete the Club without FK conflicts."""
    yield
    from models.drink import DrinkRound
    from models.game import Game, GameThrowLog
    from models.evening import EveningHighlight
    evenings = db.query(Evening).filter(Evening.club_id == club.id).all()
    for e in evenings:
        db.query(GameThrowLog).filter(GameThrowLog.game_id.in_(
            db.query(Game.id).filter(Game.evening_id == e.id)
        )).delete(synchronize_session=False)
        db.query(PenaltyLog).filter(PenaltyLog.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).delete(synchronize_session=False)
        db.query(Game).filter(Game.evening_id == e.id).delete(synchronize_session=False)
        db.query(DrinkRound).filter(DrinkRound.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningHighlight).filter(EveningHighlight.evening_id == e.id).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    # Also clean up per-test fixtures
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin_user(db: Session, club: Club) -> User:
    u = User(
        email="admin@evening.de",
        name="Evening Admin",
        hashed_password=get_password_hash("pass"),
        role=UserRole.admin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def admin_headers(admin_user: User) -> dict:
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def regular_member(db: Session, club: Club) -> RegularMember:
    m = RegularMember(club_id=club.id, name="Hans Kegel", nickname="Kegel-Hans")
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture()
def penalty_type(db: Session, club: Club) -> PenaltyType:
    pt = PenaltyType(
        club_id=club.id,
        name="Zu spät",
        icon="⏰",
        default_amount=1.0,
    )
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@pytest.fixture()
def evening(db: Session, club: Club, admin_user: User) -> Evening:
    from datetime import datetime, UTC
    e = Evening(
        club_id=club.id,
        created_by=admin_user.id,
        date=datetime(2025, 6, 15, 20, 0, 0, tzinfo=UTC),
        venue="Gasthaus Krone",
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


# ---------------------------------------------------------------------------
# GET /evening/  — list
# ---------------------------------------------------------------------------

class TestListEvenings:
    def test_returns_empty_list(self, client: TestClient, auth_headers: dict, club: Club):
        resp = client.get("/api/v1/evening/", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_created_evenings(self, client: TestClient, auth_headers: dict, evening: Evening):
        resp = client.get("/api/v1/evening/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["id"] == evening.id
        assert data[0]["venue"] == "Gasthaus Krone"

    def test_requires_authentication(self, client: TestClient, club: Club):
        resp = client.get("/api/v1/evening/")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /evening/  — create
# ---------------------------------------------------------------------------

class TestCreateEvening:
    def test_admin_can_create_evening(self, client: TestClient, admin_headers: dict, club: Club):
        resp = client.post("/api/v1/evening/", headers=admin_headers,
                           json={"date": "2025-07-01", "venue": "Neue Location"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["venue"] == "Neue Location"
        assert data["is_closed"] is False
        assert data["players"] == []

    def test_member_cannot_create_evening(self, client: TestClient, auth_headers: dict, club: Club):
        resp = client.post("/api/v1/evening/", headers=auth_headers,
                           json={"date": "2025-07-01"})
        assert resp.status_code == 403

    def test_creates_with_note(self, client: TestClient, admin_headers: dict, club: Club):
        resp = client.post("/api/v1/evening/", headers=admin_headers,
                           json={"date": "2025-08-10", "note": "Sommerfest"})
        assert resp.status_code == 200
        assert resp.json()["note"] == "Sommerfest"


# ---------------------------------------------------------------------------
# GET /evening/{eid}  — detail
# ---------------------------------------------------------------------------

class TestGetEvening:
    def test_returns_evening_detail(self, client: TestClient, auth_headers: dict, evening: Evening):
        resp = client.get(f"/api/v1/evening/{evening.id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == evening.id
        assert "players" in data
        assert "games" in data
        assert "penalty_log" in data
        assert "drink_rounds" in data

    def test_returns_404_for_wrong_club(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/evening/99999", headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /evening/{eid}  — update / close
# ---------------------------------------------------------------------------

class TestUpdateEvening:
    def test_update_venue(self, client: TestClient, auth_headers: dict, evening: Evening):
        resp = client.patch(f"/api/v1/evening/{evening.id}", headers=auth_headers,
                            json={"venue": "Neues Lokal"})
        assert resp.status_code == 200
        assert resp.json()["venue"] == "Neues Lokal"

    def test_close_evening(self, client: TestClient, admin_headers: dict, evening: Evening):
        resp = client.patch(f"/api/v1/evening/{evening.id}", headers=admin_headers,
                            json={"is_closed": True})
        assert resp.status_code == 200
        assert resp.json()["is_closed"] is True

    def test_cannot_reopen_when_another_is_open(
            self, client: TestClient, admin_headers: dict, auth_headers: dict,
            db: Session, club: Club, admin_user: User):
        from datetime import datetime, UTC

        # Create two evenings, close the second one
        e1 = Evening(club_id=club.id, created_by=admin_user.id,
                     date=datetime(2025, 1, 1, tzinfo=UTC), venue="A", is_closed=False)
        e2 = Evening(club_id=club.id, created_by=admin_user.id,
                     date=datetime(2025, 1, 8, tzinfo=UTC), venue="B", is_closed=True)
        db.add_all([e1, e2])
        db.commit()
        db.refresh(e1)
        db.refresh(e2)

        # Try to reopen e2 while e1 is open
        resp = client.patch(f"/api/v1/evening/{e2.id}", headers=admin_headers,
                            json={"is_closed": False})
        assert resp.status_code == 400
        assert "already active" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /evening/{eid}/players  — add player
# ---------------------------------------------------------------------------

class TestAddPlayer:
    def test_add_guest_player(self, client: TestClient, auth_headers: dict, evening: Evening):
        resp = client.post(f"/api/v1/evening/{evening.id}/players", headers=auth_headers,
                           json={"name": "Max Gast"})
        assert resp.status_code == 200
        data = resp.json()
        # Endpoint returns {"id", "name", "team_id"} for the new player
        assert data["name"] == "Max Gast"

    def test_add_regular_member_player(
            self, client: TestClient, auth_headers: dict, evening: Evening, regular_member: RegularMember):
        resp = client.post(f"/api/v1/evening/{evening.id}/players", headers=auth_headers,
                           json={"name": regular_member.nickname, "regular_member_id": regular_member.id})
        assert resp.status_code == 200
        assert resp.json()["name"] == regular_member.nickname

    def test_added_player_appears_in_evening(self, client: TestClient, auth_headers: dict, evening: Evening):
        client.post(f"/api/v1/evening/{evening.id}/players", headers=auth_headers,
                    json={"name": "Kegel-Franz"})
        detail_resp = client.get(f"/api/v1/evening/{evening.id}", headers=auth_headers)
        players = detail_resp.json()["players"]
        assert any(p["name"] == "Kegel-Franz" for p in players)


# ---------------------------------------------------------------------------
# POST /evening/{eid}/penalties  — add penalty
# ---------------------------------------------------------------------------

class TestAddPenalty:
    def test_add_penalty_to_player(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            penalty_type: PenaltyType):
        import time
        # Add a player first
        add_resp = client.post(f"/api/v1/evening/{evening.id}/players", headers=auth_headers,
                               json={"name": "Straft-Hans"})
        player_id = add_resp.json()["id"]

        resp = client.post(f"/api/v1/evening/{evening.id}/penalties", headers=auth_headers,
                           json={
                               "player_ids": [player_id],
                               "penalty_type_name": penalty_type.name,
                               "icon": penalty_type.icon,
                               "amount": penalty_type.default_amount,
                               "mode": "euro",
                               "client_timestamp": time.time(),
                           })
        assert resp.status_code == 200
        created = resp.json()
        assert len(created) == 1
        assert created[0]["amount"] == penalty_type.default_amount
        assert created[0]["player_name"] == "Straft-Hans"

    def test_penalty_appears_in_evening_log(
            self, client: TestClient, auth_headers: dict, evening: Evening,
            penalty_type: PenaltyType):
        import time
        add_resp = client.post(f"/api/v1/evening/{evening.id}/players", headers=auth_headers,
                               json={"name": "Penalty-Franz"})
        player_id = add_resp.json()["id"]

        client.post(f"/api/v1/evening/{evening.id}/penalties", headers=auth_headers,
                    json={
                        "player_ids": [player_id],
                        "penalty_type_name": penalty_type.name,
                        "icon": penalty_type.icon,
                        "amount": 2.50,
                        "mode": "euro",
                        "client_timestamp": time.time(),
                    })

        detail = client.get(f"/api/v1/evening/{evening.id}", headers=auth_headers)
        log = detail.json()["penalty_log"]
        assert any(entry["player_name"] == "Penalty-Franz" for entry in log)

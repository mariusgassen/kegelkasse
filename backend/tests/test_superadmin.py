"""Tests for superadmin club management endpoints."""
import pytest
from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def superadmin_user(db, club):
    u = User(
        email="superadmin@test.de",
        name="Super Admin",
        hashed_password=get_password_hash("superpass"),
        role=UserRole.superadmin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def superadmin_headers(superadmin_user):
    token = create_access_token({"sub": str(superadmin_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def member_user(db, club):
    u = User(
        email="sadmin_member@test.de",
        name="Regular Member",
        hashed_password=get_password_hash("testpass"),
        role=UserRole.member,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def member_headers(member_user):
    token = create_access_token({"sub": str(member_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def second_club(db):
    c = Club(name="Second Club", slug="second-club")
    db.add(c)
    db.commit()
    db.refresh(c)
    db.add(ClubSettings(club_id=c.id))
    db.commit()
    yield c
    db.query(ClubSettings).filter(ClubSettings.club_id == c.id).delete(synchronize_session=False)
    db.query(Club).filter(Club.id == c.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture(autouse=True)
def cleanup(db, club):
    yield
    db.query(User).filter(User.email.in_([
        "superadmin@test.de", "sadmin_member@test.de",
    ])).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# GET /superadmin/clubs
# ---------------------------------------------------------------------------

class TestListClubs:
    def test_lists_clubs(self, client, superadmin_headers, club):
        resp = client.get("/api/v1/superadmin/clubs", headers=superadmin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert any(c["id"] == club.id for c in data)

    def test_requires_superadmin(self, client, member_headers):
        resp = client.get("/api/v1/superadmin/clubs", headers=member_headers)
        assert resp.status_code == 403

    def test_requires_auth(self, client):
        resp = client.get("/api/v1/superadmin/clubs")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /superadmin/clubs
# ---------------------------------------------------------------------------

class TestCreateClub:
    def test_creates_club(self, client, superadmin_headers, db):
        resp = client.post("/api/v1/superadmin/clubs", json={"name": "New Test Club"},
                           headers=superadmin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "New Test Club"
        assert data["slug"]
        assert data["member_count"] == 0
        # cleanup
        new_id = data["id"]
        db.query(ClubSettings).filter(ClubSettings.club_id == new_id).delete(synchronize_session=False)
        db.query(Club).filter(Club.id == new_id).delete(synchronize_session=False)
        db.commit()

    def test_auto_generates_unique_slug(self, client, superadmin_headers, db):
        resp1 = client.post("/api/v1/superadmin/clubs", json={"name": "Slug Clash Club"}, headers=superadmin_headers)
        resp2 = client.post("/api/v1/superadmin/clubs", json={"name": "Slug Clash Club"}, headers=superadmin_headers)
        assert resp1.status_code == resp2.status_code == 200
        assert resp1.json()["slug"] != resp2.json()["slug"]
        for d in [resp1.json(), resp2.json()]:
            db.query(ClubSettings).filter(ClubSettings.club_id == d["id"]).delete(synchronize_session=False)
            db.query(Club).filter(Club.id == d["id"]).delete(synchronize_session=False)
        db.commit()

    def test_requires_superadmin(self, client, member_headers):
        resp = client.post("/api/v1/superadmin/clubs", json={"name": "X"}, headers=member_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PATCH /superadmin/clubs/{club_id}
# ---------------------------------------------------------------------------

class TestUpdateClub:
    def test_rename_name(self, client, superadmin_headers, second_club):
        resp = client.patch(f"/api/v1/superadmin/clubs/{second_club.id}",
                            json={"name": "Renamed Club"},
                            headers=superadmin_headers)
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed Club"

    def test_rename_slug(self, client, superadmin_headers, second_club):
        resp = client.patch(f"/api/v1/superadmin/clubs/{second_club.id}",
                            json={"slug": "new-unique-slug"},
                            headers=superadmin_headers)
        assert resp.status_code == 200
        assert resp.json()["slug"] == "new-unique-slug"

    def test_slug_conflict_returns_409(self, client, superadmin_headers, club, second_club):
        resp = client.patch(f"/api/v1/superadmin/clubs/{second_club.id}",
                            json={"slug": club.slug},
                            headers=superadmin_headers)
        assert resp.status_code == 409

    def test_invalid_slug_format_returns_400(self, client, superadmin_headers, second_club):
        resp = client.patch(f"/api/v1/superadmin/clubs/{second_club.id}",
                            json={"slug": "INVALID SLUG!"},
                            headers=superadmin_headers)
        assert resp.status_code == 400

    def test_not_found_returns_404(self, client, superadmin_headers):
        resp = client.patch("/api/v1/superadmin/clubs/999999", json={"name": "X"},
                            headers=superadmin_headers)
        assert resp.status_code == 404

    def test_requires_superadmin(self, client, member_headers, second_club):
        resp = client.patch(f"/api/v1/superadmin/clubs/{second_club.id}",
                            json={"name": "X"}, headers=member_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /superadmin/clubs/{club_id}
# ---------------------------------------------------------------------------

class TestDeleteClub:
    def test_deletes_club(self, client, superadmin_headers, db, superadmin_user):
        # Create a fresh club to delete (not the active one)
        c = Club(name="To Delete", slug="to-delete-club")
        db.add(c)
        db.flush()
        db.add(ClubSettings(club_id=c.id))
        db.commit()
        club_id = c.id

        resp = client.delete(f"/api/v1/superadmin/clubs/{club_id}", headers=superadmin_headers)
        assert resp.status_code == 204
        assert db.query(Club).filter(Club.id == club_id).first() is None

    def test_cannot_delete_active_club(self, client, superadmin_headers, club):
        resp = client.delete(f"/api/v1/superadmin/clubs/{club.id}", headers=superadmin_headers)
        assert resp.status_code == 400
        assert "active" in resp.json()["detail"].lower()

    def test_not_found_returns_404(self, client, superadmin_headers):
        resp = client.delete("/api/v1/superadmin/clubs/999999", headers=superadmin_headers)
        assert resp.status_code == 404

    def test_requires_superadmin(self, client, member_headers, second_club):
        resp = client.delete(f"/api/v1/superadmin/clubs/{second_club.id}", headers=member_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /superadmin/switch-club/{club_id}
# ---------------------------------------------------------------------------

class TestSwitchClub:
    def test_switch_club(self, client, superadmin_headers, second_club, superadmin_user, db):
        resp = client.post(f"/api/v1/superadmin/switch-club/{second_club.id}",
                           headers=superadmin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["club_id"] == second_club.id
        # restore original club
        superadmin_user.club_id = db.query(Club).filter(Club.slug == "test-club").first().id
        db.commit()

    def test_switch_not_found(self, client, superadmin_headers):
        resp = client.post("/api/v1/superadmin/switch-club/999999", headers=superadmin_headers)
        assert resp.status_code == 404

    def test_requires_superadmin(self, client, member_headers, second_club):
        resp = client.post(f"/api/v1/superadmin/switch-club/{second_club.id}",
                           headers=member_headers)
        assert resp.status_code == 403

"""Tests for committee endpoints — announcements and trips."""
import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.user import User, UserRole
from models.evening import RegularMember
from models.committee import ClubAnnouncement, ClubTrip


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db, club):
    u = User(
        email="committeeadmin@test.de",
        name="Committee Admin",
        username="committeeadmin",
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


@pytest.fixture(autouse=True)
def cleanup(db, club):
    yield
    db.query(ClubAnnouncement).filter(ClubAnnouncement.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubTrip).filter(ClubTrip.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# GET /api/v1/committee/announcements
# ---------------------------------------------------------------------------

class TestListAnnouncements:
    def test_empty_list(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/committee/announcements", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_announcement(self, client: TestClient, db, club, admin_user, auth_headers):
        ann = ClubAnnouncement(
            club_id=club.id,
            title="Test Announcement",
            text="Hello club!",
            created_by=admin_user.id,
        )
        db.add(ann)
        db.commit()
        resp = client.get("/api/v1/committee/announcements", headers=auth_headers)
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "Test Announcement"

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/committee/announcements")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/committee/announcements
# ---------------------------------------------------------------------------

class TestCreateAnnouncement:
    def test_admin_can_create(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/announcements", json={
            "title": "New Event",
            "text": "Details here",
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "New Event"
        assert data["text"] == "Details here"

    def test_member_cannot_create(self, client: TestClient, auth_headers):
        resp = client.post("/api/v1/committee/announcements", json={
            "title": "Unauthorized",
        }, headers=auth_headers)
        assert resp.status_code == 403

    def test_requires_auth(self, client: TestClient):
        resp = client.post("/api/v1/committee/announcements", json={"title": "X"})
        assert resp.status_code == 401

    def test_title_only_is_valid(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/announcements", json={
            "title": "Title Only",
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["text"] is None


# ---------------------------------------------------------------------------
# DELETE /api/v1/committee/announcements/{aid}
# ---------------------------------------------------------------------------

class TestDeleteAnnouncement:
    def test_admin_can_delete(self, client: TestClient, db, club, admin_user, admin_headers):
        ann = ClubAnnouncement(
            club_id=club.id,
            title="To Delete",
            created_by=admin_user.id,
        )
        db.add(ann)
        db.commit()
        resp = client.delete(f"/api/v1/committee/announcements/{ann.id}", headers=admin_headers)
        assert resp.status_code == 204
        db.refresh(ann)
        assert ann.is_deleted is True

    def test_member_cannot_delete(self, client: TestClient, db, club, admin_user, auth_headers):
        ann = ClubAnnouncement(
            club_id=club.id,
            title="Protected",
            created_by=admin_user.id,
        )
        db.add(ann)
        db.commit()
        resp = client.delete(f"/api/v1/committee/announcements/{ann.id}", headers=auth_headers)
        assert resp.status_code == 403

    def test_nonexistent_returns_404(self, client: TestClient, admin_headers):
        resp = client.delete("/api/v1/committee/announcements/99999", headers=admin_headers)
        assert resp.status_code == 404

    def test_deleted_announcement_not_in_list(self, client: TestClient, db, club, admin_user, admin_headers, auth_headers):
        ann = ClubAnnouncement(
            club_id=club.id,
            title="Hide Me",
            created_by=admin_user.id,
        )
        db.add(ann)
        db.commit()
        client.delete(f"/api/v1/committee/announcements/{ann.id}", headers=admin_headers)
        resp = client.get("/api/v1/committee/announcements", headers=auth_headers)
        assert all(a["title"] != "Hide Me" for a in resp.json())


# ---------------------------------------------------------------------------
# GET /api/v1/committee/trips
# ---------------------------------------------------------------------------

class TestListTrips:
    def test_empty_list(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/committee/trips", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_trip(self, client: TestClient, db, club, admin_user, auth_headers):
        from datetime import datetime, UTC
        trip = ClubTrip(
            club_id=club.id,
            date=datetime(2025, 8, 10, 10, 0, tzinfo=UTC),
            destination="Hamburg",
            created_by=admin_user.id,
        )
        db.add(trip)
        db.commit()
        resp = client.get("/api/v1/committee/trips", headers=auth_headers)
        data = resp.json()
        assert len(data) == 1
        assert data[0]["destination"] == "Hamburg"

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/committee/trips")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/committee/trips
# ---------------------------------------------------------------------------

class TestCreateTrip:
    def test_admin_can_create_trip(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/trips", json={
            "date": "2025-09-15T10:00",
            "destination": "Berlin",
            "note": "Fun trip!",
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["destination"] == "Berlin"
        assert data["note"] == "Fun trip!"

    def test_member_cannot_create_trip(self, client: TestClient, auth_headers):
        resp = client.post("/api/v1/committee/trips", json={
            "date": "2025-09-15T10:00",
            "destination": "Unauthorized",
        }, headers=auth_headers)
        assert resp.status_code == 403

    def test_invalid_date_format_returns_400(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/trips", json={
            "date": "not-a-date",
            "destination": "Nowhere",
        }, headers=admin_headers)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# PATCH /api/v1/committee/trips/{tid}
# ---------------------------------------------------------------------------

class TestUpdateTrip:
    def _create_trip(self, db, club, admin_user):
        from datetime import datetime, UTC
        trip = ClubTrip(
            club_id=club.id,
            date=datetime(2025, 8, 10, 10, 0, tzinfo=UTC),
            destination="Old Destination",
            created_by=admin_user.id,
        )
        db.add(trip)
        db.commit()
        db.refresh(trip)
        return trip

    def test_admin_can_update_destination(self, client: TestClient, db, club, admin_user, admin_headers):
        trip = self._create_trip(db, club, admin_user)
        resp = client.patch(f"/api/v1/committee/trips/{trip.id}", json={
            "destination": "Munich",
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["destination"] == "Munich"

    def test_member_cannot_update(self, client: TestClient, db, club, admin_user, auth_headers):
        trip = self._create_trip(db, club, admin_user)
        resp = client.patch(f"/api/v1/committee/trips/{trip.id}", json={
            "destination": "Hacked",
        }, headers=auth_headers)
        assert resp.status_code == 403

    def test_nonexistent_returns_404(self, client: TestClient, admin_headers):
        resp = client.patch("/api/v1/committee/trips/99999", json={"destination": "X"}, headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/v1/committee/trips/{tid}
# ---------------------------------------------------------------------------

class TestDeleteTrip:
    def _create_trip(self, db, club, admin_user):
        from datetime import datetime, UTC
        trip = ClubTrip(
            club_id=club.id,
            date=datetime(2025, 8, 10, 10, 0, tzinfo=UTC),
            destination="Trip to Delete",
            created_by=admin_user.id,
        )
        db.add(trip)
        db.commit()
        db.refresh(trip)
        return trip

    def test_admin_can_delete_trip(self, client: TestClient, db, club, admin_user, admin_headers):
        trip = self._create_trip(db, club, admin_user)
        resp = client.delete(f"/api/v1/committee/trips/{trip.id}", headers=admin_headers)
        assert resp.status_code == 204
        db.refresh(trip)
        assert trip.is_deleted is True

    def test_member_cannot_delete_trip(self, client: TestClient, db, club, admin_user, auth_headers):
        trip = self._create_trip(db, club, admin_user)
        resp = client.delete(f"/api/v1/committee/trips/{trip.id}", headers=auth_headers)
        assert resp.status_code == 403

    def test_nonexistent_returns_404(self, client: TestClient, admin_headers):
        resp = client.delete("/api/v1/committee/trips/99999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/v1/committee/members
# ---------------------------------------------------------------------------

class TestListCommitteeMembers:
    def test_returns_committee_members_only(self, client: TestClient, db, club, auth_headers):
        non_committee = RegularMember(club_id=club.id, name="Normal", is_committee=False)
        committee = RegularMember(club_id=club.id, name="Committee Person", is_committee=True)
        db.add_all([non_committee, committee])
        db.commit()
        resp = client.get("/api/v1/committee/members", headers=auth_headers)
        assert resp.status_code == 200
        names = [m["name"] for m in resp.json()]
        assert "Committee Person" in names
        assert "Normal" not in names

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/committee/members")
        assert resp.status_code == 401

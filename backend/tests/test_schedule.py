"""Tests for scheduled evenings and RSVP endpoints."""
import pytest
from datetime import datetime, timedelta, UTC
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.user import User, UserRole
from models.evening import RegularMember
from models.schedule import ScheduledEvening, MemberRsvp


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db, club):
    u = User(
        email="schedadmin@test.de",
        name="Sched Admin",
        username="schedadmin",
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
    m = RegularMember(club_id=club.id, name="Rudi Kegel", nickname="Rudi")
    db.add(m)
    db.commit()
    db.refresh(m)
    yield m


@pytest.fixture()
def member_with_roster(db, club, regular_member):
    """A member user linked to a RegularMember so RSVP works."""
    u = User(
        email="rsvpmember@test.de",
        name="RSVP Member",
        hashed_password=get_password_hash("pass"),
        role=UserRole.member,
        club_id=club.id,
        regular_member_id=regular_member.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def member_with_roster_headers(member_with_roster):
    token = create_access_token({"sub": str(member_with_roster.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def future_date() -> str:
    """ISO datetime 30 days from now."""
    return (datetime.now(UTC) + timedelta(days=30)).strftime('%Y-%m-%dT%H:%M')


@pytest.fixture(autouse=True)
def cleanup(db, club):
    yield
    from models.club import ClubSettings
    db.query(MemberRsvp).delete(synchronize_session=False)
    db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# GET /api/v1/schedule/
# ---------------------------------------------------------------------------

class TestListScheduledEvenings:
    def test_empty_list(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/schedule/", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_created_evening(self, client: TestClient, db, club, admin_user, admin_headers, future_date, user, auth_headers):
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=30),
            venue="Testgasse",
            created_by=admin_user.id,
        )
        db.add(se)
        db.commit()
        resp = client.get("/api/v1/schedule/", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["venue"] == "Testgasse"

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/schedule/")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/schedule/
# ---------------------------------------------------------------------------

class TestCreateScheduledEvening:
    def test_admin_can_create(self, client: TestClient, admin_headers, future_date):
        resp = client.post("/api/v1/schedule/", json={"date": future_date, "venue": "Bowlingcenter"}, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["venue"] == "Bowlingcenter"
        assert "id" in data

    def test_member_cannot_create(self, client: TestClient, auth_headers, future_date):
        resp = client.post("/api/v1/schedule/", json={"date": future_date}, headers=auth_headers)
        assert resp.status_code == 403

    def test_past_date_rejected(self, client: TestClient, admin_headers):
        past = (datetime.now(UTC) - timedelta(days=1)).strftime('%Y-%m-%dT%H:%M')
        resp = client.post("/api/v1/schedule/", json={"date": past}, headers=admin_headers)
        assert resp.status_code == 400

    def test_requires_auth(self, client: TestClient, future_date):
        resp = client.post("/api/v1/schedule/", json={"date": future_date})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /api/v1/schedule/{sid}
# ---------------------------------------------------------------------------

class TestUpdateScheduledEvening:
    def _create(self, db, club, admin_user, days=30) -> ScheduledEvening:
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=days),
            venue="Old Venue",
            created_by=admin_user.id,
        )
        db.add(se)
        db.commit()
        db.refresh(se)
        return se

    def test_admin_can_update_venue(self, client: TestClient, db, club, admin_user, admin_headers):
        se = self._create(db, club, admin_user)
        resp = client.patch(f"/api/v1/schedule/{se.id}", json={"venue": "New Venue"}, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["venue"] == "New Venue"

    def test_member_cannot_update(self, client: TestClient, db, club, admin_user, auth_headers):
        se = self._create(db, club, admin_user)
        resp = client.patch(f"/api/v1/schedule/{se.id}", json={"venue": "Hacked"}, headers=auth_headers)
        assert resp.status_code == 403

    def test_nonexistent_returns_404(self, client: TestClient, admin_headers):
        resp = client.patch("/api/v1/schedule/99999", json={"venue": "X"}, headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/v1/schedule/{sid}
# ---------------------------------------------------------------------------

class TestDeleteScheduledEvening:
    def _create(self, db, club, admin_user) -> ScheduledEvening:
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=10),
            created_by=admin_user.id,
        )
        db.add(se)
        db.commit()
        db.refresh(se)
        return se

    def test_admin_can_delete(self, client: TestClient, db, club, admin_user, admin_headers):
        se = self._create(db, club, admin_user)
        resp = client.delete(f"/api/v1/schedule/{se.id}", headers=admin_headers)
        assert resp.status_code == 204
        db.refresh(se)
        assert se.is_deleted is True

    def test_member_cannot_delete(self, client: TestClient, db, club, admin_user, auth_headers):
        se = self._create(db, club, admin_user)
        resp = client.delete(f"/api/v1/schedule/{se.id}", headers=auth_headers)
        assert resp.status_code == 403

    def test_nonexistent_returns_404(self, client: TestClient, admin_headers):
        resp = client.delete("/api/v1/schedule/99999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/schedule/{sid}/rsvp — set RSVP (member's own)
# ---------------------------------------------------------------------------

class TestSetRsvp:
    def _create_se(self, db, club, admin_user) -> ScheduledEvening:
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=7),
            created_by=admin_user.id,
        )
        db.add(se)
        db.commit()
        db.refresh(se)
        return se

    def test_member_can_rsvp_attending(self, client: TestClient, db, club, admin_user,
                                        member_with_roster, member_with_roster_headers):
        se = self._create_se(db, club, admin_user)
        resp = client.post(f"/api/v1/schedule/{se.id}/rsvp",
                           json={"status": "attending"}, headers=member_with_roster_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "attending"

    def test_member_can_rsvp_absent(self, client: TestClient, db, club, admin_user,
                                     member_with_roster, member_with_roster_headers):
        se = self._create_se(db, club, admin_user)
        resp = client.post(f"/api/v1/schedule/{se.id}/rsvp",
                           json={"status": "absent"}, headers=member_with_roster_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "absent"

    def test_rsvp_upserts(self, client: TestClient, db, club, admin_user,
                           member_with_roster, member_with_roster_headers):
        se = self._create_se(db, club, admin_user)
        client.post(f"/api/v1/schedule/{se.id}/rsvp",
                    json={"status": "attending"}, headers=member_with_roster_headers)
        client.post(f"/api/v1/schedule/{se.id}/rsvp",
                    json={"status": "absent"}, headers=member_with_roster_headers)
        rsvps = db.query(MemberRsvp).filter(MemberRsvp.scheduled_evening_id == se.id).all()
        assert len(rsvps) == 1
        assert rsvps[0].status == "absent"

    def test_user_without_roster_cannot_rsvp(self, client: TestClient, db, club, admin_user, user, auth_headers):
        se = self._create_se(db, club, admin_user)
        resp = client.post(f"/api/v1/schedule/{se.id}/rsvp",
                           json={"status": "attending"}, headers=auth_headers)
        assert resp.status_code == 400

    def test_invalid_status_rejected(self, client: TestClient, db, club, admin_user,
                                      member_with_roster, member_with_roster_headers):
        se = self._create_se(db, club, admin_user)
        resp = client.post(f"/api/v1/schedule/{se.id}/rsvp",
                           json={"status": "maybe"}, headers=member_with_roster_headers)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# DELETE /api/v1/schedule/{sid}/rsvp — remove own RSVP
# ---------------------------------------------------------------------------

class TestRemoveRsvp:
    def test_member_can_remove_rsvp(self, client: TestClient, db, club, admin_user,
                                     member_with_roster, member_with_roster_headers, regular_member):
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=7),
            created_by=admin_user.id,
        )
        db.add(se)
        db.commit()
        db.refresh(se)
        rsvp = MemberRsvp(
            scheduled_evening_id=se.id,
            regular_member_id=regular_member.id,
            status="attending",
        )
        db.add(rsvp)
        db.commit()
        resp = client.delete(f"/api/v1/schedule/{se.id}/rsvp", headers=member_with_roster_headers)
        assert resp.status_code == 204
        assert db.query(MemberRsvp).filter(MemberRsvp.id == rsvp.id).first() is None


# ---------------------------------------------------------------------------
# GET /api/v1/schedule/{sid}/rsvps — list all RSVPs for an evening
# ---------------------------------------------------------------------------

class TestListRsvps:
    def test_returns_rsvp_list(self, client: TestClient, db, club, admin_user, admin_headers, regular_member):
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=7),
            created_by=admin_user.id,
        )
        db.add(se)
        db.commit()
        db.refresh(se)
        rsvp = MemberRsvp(
            scheduled_evening_id=se.id,
            regular_member_id=regular_member.id,
            status="attending",
        )
        db.add(rsvp)
        db.commit()
        resp = client.get(f"/api/v1/schedule/{se.id}/rsvps", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["status"] == "attending"

    def test_requires_auth(self, client: TestClient, db, club, admin_user):
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=7),
            created_by=admin_user.id,
        )
        db.add(se)
        db.commit()
        resp = client.get(f"/api/v1/schedule/{se.id}/rsvps")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/schedule/ical/{token}.ics — iCal feed
# ---------------------------------------------------------------------------

class TestIcalFeed:
    def test_returns_ical_content(self, client: TestClient, db, club):
        from models.club import ClubSettings
        # Ensure ical_token is set
        settings = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
        if not settings:
            settings = ClubSettings(club_id=club.id, extra={"ical_token": "test-ical-token"})
            db.add(settings)
        else:
            extra = dict(settings.extra or {})
            extra["ical_token"] = "test-ical-token"
            settings.extra = extra
        db.commit()
        resp = client.get("/api/v1/schedule/ical/test-ical-token.ics")
        assert resp.status_code == 200
        assert "VCALENDAR" in resp.text
        assert "BEGIN:VCALENDAR" in resp.text

    def test_invalid_token_returns_404(self, client: TestClient):
        resp = client.get("/api/v1/schedule/ical/invalid-token.ics")
        assert resp.status_code == 404

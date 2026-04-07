"""Tests for committee endpoints — announcements, trips, and polls."""
import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.user import User, UserRole
from models.evening import RegularMember
from models.committee import ClubAnnouncement, ClubTrip, ClubPoll, PollOption, PollVote


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
    # poll children first
    poll_ids = [p.id for p in db.query(ClubPoll).filter(ClubPoll.club_id == club.id).all()]
    if poll_ids:
        db.query(PollVote).filter(PollVote.poll_id.in_(poll_ids)).delete(synchronize_session=False)
        db.query(PollOption).filter(PollOption.poll_id.in_(poll_ids)).delete(synchronize_session=False)
    db.query(ClubPoll).filter(ClubPoll.club_id == club.id).delete(synchronize_session=False)
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_poll(db, club, admin_user, mode="single", is_closed=False):
    poll = ClubPoll(
        club_id=club.id,
        title="Wohin fahren wir?",
        text="Bitte abstimmen",
        mode=mode,
        is_closed=is_closed,
        created_by=admin_user.id,
    )
    db.add(poll)
    db.flush()
    opts = [
        PollOption(poll_id=poll.id, text="Berlin", sort_order=0),
        PollOption(poll_id=poll.id, text="Hamburg", sort_order=1),
        PollOption(poll_id=poll.id, text="München", sort_order=2),
    ]
    for o in opts:
        db.add(o)
    db.commit()
    db.refresh(poll)
    return poll, opts


# ---------------------------------------------------------------------------
# GET /api/v1/committee/polls
# ---------------------------------------------------------------------------

class TestListPolls:
    def test_empty_list(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/committee/polls", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_poll_with_options(self, client: TestClient, db, club, admin_user, auth_headers):
        _create_poll(db, club, admin_user)
        resp = client.get("/api/v1/committee/polls", headers=auth_headers)
        data = resp.json()
        assert len(data) == 1
        assert data[0]["title"] == "Wohin fahren wir?"
        assert len(data[0]["options"]) == 3
        assert data[0]["options"][0]["text"] == "Berlin"
        assert data[0]["options"][0]["vote_count"] == 0
        assert data[0]["options"][0]["voted_by_me"] is False

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/committee/polls")
        assert resp.status_code == 401

    def test_deleted_poll_not_listed(self, client: TestClient, db, club, admin_user, auth_headers, admin_headers):
        poll, _ = _create_poll(db, club, admin_user)
        client.delete(f"/api/v1/committee/polls/{poll.id}", headers=admin_headers)
        resp = client.get("/api/v1/committee/polls", headers=auth_headers)
        assert resp.json() == []


# ---------------------------------------------------------------------------
# POST /api/v1/committee/polls
# ---------------------------------------------------------------------------

class TestCreatePoll:
    def test_admin_can_create_single(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/polls", json={
            "title": "Neue Frage",
            "mode": "single",
            "options": ["Ja", "Nein"],
        }, headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Neue Frage"
        assert data["mode"] == "single"
        assert len(data["options"]) == 2
        assert data["is_closed"] is False

    def test_admin_can_create_multi(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/polls", json={
            "title": "Was esst ihr?",
            "mode": "multi",
            "options": ["Pizza", "Pasta", "Salat"],
        }, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["mode"] == "multi"

    def test_member_cannot_create(self, client: TestClient, auth_headers):
        resp = client.post("/api/v1/committee/polls", json={
            "title": "Verboten",
            "mode": "single",
            "options": ["A", "B"],
        }, headers=auth_headers)
        assert resp.status_code == 403

    def test_requires_auth(self, client: TestClient):
        resp = client.post("/api/v1/committee/polls", json={
            "title": "X", "mode": "single", "options": ["A", "B"],
        })
        assert resp.status_code == 401

    def test_invalid_mode_returns_400(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/polls", json={
            "title": "X",
            "mode": "invalid",
            "options": ["A", "B"],
        }, headers=admin_headers)
        assert resp.status_code == 400

    def test_too_few_options_returns_400(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/polls", json={
            "title": "X",
            "mode": "single",
            "options": ["Only one"],
        }, headers=admin_headers)
        assert resp.status_code == 400

    def test_empty_option_text_returns_400(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/committee/polls", json={
            "title": "X",
            "mode": "single",
            "options": ["Valid", "   "],
        }, headers=admin_headers)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# PATCH /api/v1/committee/polls/{pid}
# ---------------------------------------------------------------------------

class TestUpdatePoll:
    def test_admin_can_close_poll(self, client: TestClient, db, club, admin_user, admin_headers):
        poll, _ = _create_poll(db, club, admin_user)
        resp = client.patch(f"/api/v1/committee/polls/{poll.id}", json={"is_closed": True}, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["is_closed"] is True

    def test_admin_can_reopen_poll(self, client: TestClient, db, club, admin_user, admin_headers):
        poll, _ = _create_poll(db, club, admin_user, is_closed=True)
        resp = client.patch(f"/api/v1/committee/polls/{poll.id}", json={"is_closed": False}, headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["is_closed"] is False

    def test_member_cannot_update(self, client: TestClient, db, club, admin_user, auth_headers):
        poll, _ = _create_poll(db, club, admin_user)
        resp = client.patch(f"/api/v1/committee/polls/{poll.id}", json={"is_closed": True}, headers=auth_headers)
        assert resp.status_code == 403

    def test_nonexistent_returns_404(self, client: TestClient, admin_headers):
        resp = client.patch("/api/v1/committee/polls/99999", json={"is_closed": True}, headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/v1/committee/polls/{pid}
# ---------------------------------------------------------------------------

class TestDeletePoll:
    def test_admin_can_delete(self, client: TestClient, db, club, admin_user, admin_headers):
        poll, _ = _create_poll(db, club, admin_user)
        resp = client.delete(f"/api/v1/committee/polls/{poll.id}", headers=admin_headers)
        assert resp.status_code == 204
        db.refresh(poll)
        assert poll.is_deleted is True

    def test_member_cannot_delete(self, client: TestClient, db, club, admin_user, auth_headers):
        poll, _ = _create_poll(db, club, admin_user)
        resp = client.delete(f"/api/v1/committee/polls/{poll.id}", headers=auth_headers)
        assert resp.status_code == 403

    def test_nonexistent_returns_404(self, client: TestClient, admin_headers):
        resp = client.delete("/api/v1/committee/polls/99999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/committee/polls/{pid}/vote
# ---------------------------------------------------------------------------

class TestCastVote:
    def test_member_can_vote_single(self, client: TestClient, db, club, admin_user, user, auth_headers):
        poll, opts = _create_poll(db, club, admin_user)
        resp = client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                           json={"option_ids": [opts[0].id]}, headers=auth_headers)
        assert resp.status_code == 204
        # Check vote reflected in list
        data = client.get("/api/v1/committee/polls", headers=auth_headers).json()
        voted_opt = next(o for o in data[0]["options"] if o["id"] == opts[0].id)
        assert voted_opt["vote_count"] == 1
        assert voted_opt["voted_by_me"] is True

    def test_member_can_vote_multi(self, client: TestClient, db, club, admin_user, user, auth_headers):
        poll, opts = _create_poll(db, club, admin_user, mode="multi")
        resp = client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                           json={"option_ids": [opts[0].id, opts[1].id]}, headers=auth_headers)
        assert resp.status_code == 204

    def test_single_poll_rejects_multiple_options(self, client: TestClient, db, club, admin_user, auth_headers):
        poll, opts = _create_poll(db, club, admin_user, mode="single")
        resp = client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                           json={"option_ids": [opts[0].id, opts[1].id]}, headers=auth_headers)
        assert resp.status_code == 400

    def test_cannot_vote_on_closed_poll(self, client: TestClient, db, club, admin_user, auth_headers):
        poll, opts = _create_poll(db, club, admin_user, is_closed=True)
        resp = client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                           json={"option_ids": [opts[0].id]}, headers=auth_headers)
        assert resp.status_code == 400

    def test_invalid_option_returns_400(self, client: TestClient, db, club, admin_user, auth_headers):
        poll, _ = _create_poll(db, club, admin_user)
        resp = client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                           json={"option_ids": [99999]}, headers=auth_headers)
        assert resp.status_code == 400

    def test_revoting_replaces_previous_vote(self, client: TestClient, db, club, admin_user, user, auth_headers):
        poll, opts = _create_poll(db, club, admin_user)
        client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                    json={"option_ids": [opts[0].id]}, headers=auth_headers)
        client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                    json={"option_ids": [opts[1].id]}, headers=auth_headers)
        data = client.get("/api/v1/committee/polls", headers=auth_headers).json()
        poll_data = data[0]
        opt0 = next(o for o in poll_data["options"] if o["id"] == opts[0].id)
        opt1 = next(o for o in poll_data["options"] if o["id"] == opts[1].id)
        assert opt0["vote_count"] == 0
        assert opt1["vote_count"] == 1
        assert opt1["voted_by_me"] is True

    def test_requires_auth(self, client: TestClient, db, club, admin_user):
        poll, opts = _create_poll(db, club, admin_user)
        resp = client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                           json={"option_ids": [opts[0].id]})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/committee/polls/{pid}/vote
# ---------------------------------------------------------------------------

class TestRetractVote:
    def test_member_can_retract(self, client: TestClient, db, club, admin_user, user, auth_headers):
        poll, opts = _create_poll(db, club, admin_user)
        client.post(f"/api/v1/committee/polls/{poll.id}/vote",
                    json={"option_ids": [opts[0].id]}, headers=auth_headers)
        resp = client.delete(f"/api/v1/committee/polls/{poll.id}/vote", headers=auth_headers)
        assert resp.status_code == 204
        data = client.get("/api/v1/committee/polls", headers=auth_headers).json()
        assert all(o["vote_count"] == 0 for o in data[0]["options"])
        assert all(not o["voted_by_me"] for o in data[0]["options"])

    def test_retract_on_closed_returns_400(self, client: TestClient, db, club, admin_user, auth_headers):
        poll, opts = _create_poll(db, club, admin_user, is_closed=True)
        resp = client.delete(f"/api/v1/committee/polls/{poll.id}/vote", headers=auth_headers)
        assert resp.status_code == 400

    def test_nonexistent_poll_returns_404(self, client: TestClient, auth_headers):
        resp = client.delete("/api/v1/committee/polls/99999/vote", headers=auth_headers)
        assert resp.status_code == 404

    def test_requires_auth(self, client: TestClient, db, club, admin_user):
        poll, _ = _create_poll(db, club, admin_user)
        resp = client.delete(f"/api/v1/committee/polls/{poll.id}/vote")
        assert resp.status_code == 401

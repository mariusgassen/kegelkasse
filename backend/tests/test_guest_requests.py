"""
Tests for guest requests:
  POST /public/clubs/{slug}/schedule/{sid}/guest-requests   — public, unauthenticated
  GET  /public/clubs/{slug}/schedule/{sid}                  — public single evening
  GET  /guest-requests/                                     — member overview
  POST /guest-requests/{rid}/approve | /reject              — any member decides

The public endpoint triggers mails to every member, so the abuse guards (honeypot, rate limits,
duplicates) get as much attention as the happy path.
"""
from datetime import datetime, timedelta, UTC
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.v1 import public
from core.push import _user_channels
from models.club import Club, ClubSettings
from models.schedule import GuestRequest, ScheduledEvening, ScheduledEveningGuest
from models.user import User

BASE = "/api/v1/public/clubs/test-club/schedule"
SMTP = {"host": "smtp.example.com", "port": 587, "from_address": "kasse@example.com"}


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    public._request_limiter.reset()
    yield
    db.rollback()
    se_ids = [se.id for se in db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id)]
    db.query(GuestRequest).filter(GuestRequest.club_id == club.id).delete(synchronize_session=False)
    if se_ids:
        db.query(ScheduledEveningGuest).filter(
            ScheduledEveningGuest.scheduled_evening_id.in_(se_ids)).delete(synchronize_session=False)
    db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def public_club(db: Session, club: Club) -> Club:
    db.add(ClubSettings(club_id=club.id, extra={"public_schedule_enabled": True}))
    db.commit()
    return club


def _evening(db: Session, club: Club, days: float = 7, **kw) -> ScheduledEvening:
    se = ScheduledEvening(club_id=club.id, scheduled_at=datetime(2099, 11, 14, 20, 0, tzinfo=UTC)
                          if days is None else datetime.now(UTC) + timedelta(days=days),
                          venue="Altes Schalthaus", **kw)
    db.add(se)
    db.commit()
    db.refresh(se)
    return se


def _payload(**kw) -> dict:
    return {"name": "Anna Gast", "email": "Anna@Example.com", "message": "Komme gern!", **kw}


def _submit(client: TestClient, sid: int, **kw):
    with patch("api.v1.guest_requests.push_to_club") as notify:
        r = client.post(f"{BASE}/{sid}/guest-requests", json=_payload(**kw))
    return r, notify


def _request(db: Session, club: Club, se: ScheduledEvening, **kw) -> GuestRequest:
    req = GuestRequest(club_id=club.id, scheduled_evening_id=se.id, name="Anna Gast",
                       email="anna@example.com", **kw)
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


# ── Public: submit ───────────────────────────────────────────────────────────

class TestSubmitGuestRequest:
    def test_creates_request_and_notifies_members(self, client, db, public_club):
        se = _evening(db, public_club)
        r, notify = _submit(client, se.id)
        assert r.status_code == 202
        assert r.json() == {"ok": True}
        req = db.query(GuestRequest).one()
        assert (req.name, req.email, req.message, req.status) == ("Anna Gast", "anna@example.com",
                                                                   "Komme gern!", "pending")
        notify.assert_called_once()
        args, kwargs = notify.call_args
        assert args[1] == public_club.id
        assert "Anna Gast" in args[3]
        assert args[4] == "/#schedule?requests=1"
        assert kwargs["category"] == "guest_requests"

    def test_no_auth_needed_but_club_must_be_public(self, client, db, club):
        db.add(ClubSettings(club_id=club.id, extra={"public_schedule_enabled": False}))
        db.commit()
        se = _evening(db, club)
        r, notify = _submit(client, se.id)
        assert r.status_code == 404
        notify.assert_not_called()

    @pytest.mark.parametrize("kw", [{"days": -1}, {"is_deleted": True}, {"guest_requests_enabled": False}])
    def test_only_open_upcoming_evenings(self, client, db, public_club, kw):
        se = _evening(db, public_club, **kw)
        r, notify = _submit(client, se.id)
        assert r.status_code == 404
        assert db.query(GuestRequest).count() == 0
        notify.assert_not_called()

    def test_evening_of_other_club_is_404(self, client, db, public_club):
        other = Club(name="Other", slug="other-club")
        db.add(other)
        db.commit()
        try:
            se = _evening(db, other)
            r, _ = _submit(client, se.id)
            assert r.status_code == 404
        finally:
            db.query(ScheduledEvening).filter(ScheduledEvening.club_id == other.id).delete()
            db.delete(other)
            db.commit()

    @pytest.mark.parametrize("kw", [{"email": "not-an-email"}, {"name": ""}, {"name": "x" * 81},
                                    {"message": "x" * 1001}])
    def test_validation(self, client, db, public_club, kw):
        se = _evening(db, public_club)
        r, notify = _submit(client, se.id, **kw)
        assert r.status_code == 422
        notify.assert_not_called()

    def test_honeypot_looks_successful_but_creates_nothing(self, client, db, public_club):
        se = _evening(db, public_club)
        r, notify = _submit(client, se.id, website="http://spam.example")
        assert r.status_code == 202
        assert db.query(GuestRequest).count() == 0
        notify.assert_not_called()

    def test_duplicate_is_not_created_twice(self, client, db, public_club):
        se = _evening(db, public_club)
        _submit(client, se.id)
        r, notify = _submit(client, se.id, email="anna@example.com")
        assert r.status_code == 202
        assert db.query(GuestRequest).count() == 1
        notify.assert_not_called()

    def test_rejected_requester_may_ask_again(self, client, db, public_club):
        se = _evening(db, public_club)
        _request(db, public_club, se, status="rejected")
        _submit(client, se.id)
        assert db.query(GuestRequest).count() == 2

    def test_rate_limit_per_email(self, client, db, public_club):
        evenings = [_evening(db, public_club, days=d) for d in range(1, 6)]
        for se in evenings:
            _submit(client, se.id)
        assert db.query(GuestRequest).count() == 3  # _MAX_REQUESTS_PER_EMAIL

    def test_rate_limit_per_ip(self, client, db, public_club):
        se = _evening(db, public_club)
        for i in range(7):
            _submit(client, se.id, email=f"gast{i}@example.com")
        assert db.query(GuestRequest).count() == 5  # _MAX_REQUESTS_PER_IP

    def test_never_mails_the_submitted_address(self, client, db, public_club):
        se = _evening(db, public_club)
        with patch("api.v1.guest_requests.send_club_email") as send:
            _submit(client, se.id)
        send.assert_not_called()


class TestPublicSingleEvening:
    def test_returns_evening_with_flag(self, client, db, public_club):
        se = _evening(db, public_club, guest_requests_enabled=False)
        r = client.get(f"{BASE}/{se.id}")
        assert r.status_code == 200
        assert r.json()["evening"]["id"] == se.id
        assert r.json()["evening"]["guest_requests_enabled"] is False

    def test_past_evening_is_404(self, client, db, public_club):
        se = _evening(db, public_club, days=-1)
        assert client.get(f"{BASE}/{se.id}").status_code == 404


# ── Members: overview & decisions ───────────────────────────────────────────

class TestGuestRequestOverview:
    def test_requires_login(self, client):
        assert client.get("/api/v1/guest-requests/").status_code == 401

    def test_lists_pending_first(self, client, db, club, auth_headers):
        se = _evening(db, club)
        decided = _request(db, club, se, status="rejected", decided_at=datetime.now(UTC))
        pending = _request(db, club, se)
        r = client.get("/api/v1/guest-requests/", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert [x["id"] for x in body] == [pending.id, decided.id]
        assert body[0]["venue"] == "Altes Schalthaus"
        assert body[0]["evening_cancelled"] is False

    def test_other_clubs_requests_hidden(self, client, db, club, auth_headers):
        other = Club(name="Other", slug="other-club")
        db.add(other)
        db.commit()
        try:
            se = _evening(db, other)
            _request(db, other, se)
            assert client.get("/api/v1/guest-requests/", headers=auth_headers).json() == []
        finally:
            db.query(GuestRequest).filter(GuestRequest.club_id == other.id).delete()
            db.query(ScheduledEvening).filter(ScheduledEvening.club_id == other.id).delete()
            db.delete(other)
            db.commit()


class TestGuestRequestDecision:
    def _decide(self, client, auth_headers, rid, action, smtp=SMTP):
        with patch("api.v1.guest_requests.get_club_email_config", return_value=smtp), \
             patch("api.v1.guest_requests.send_club_email") as send:
            r = client.post(f"/api/v1/guest-requests/{rid}/{action}", headers=auth_headers)
        return r, send

    def test_member_approves_adds_guest_and_mails(self, client, db, club, user: User, auth_headers):
        se = _evening(db, club, days=None)
        req = _request(db, club, se)
        r, send = self._decide(client, auth_headers, req.id, "approve")
        assert r.status_code == 200
        assert r.json()["status"] == "approved"
        assert r.json()["guest_notified"] is True
        db.refresh(req)
        assert req.decided_by == user.id
        guest = db.query(ScheduledEveningGuest).filter(ScheduledEveningGuest.id == req.guest_id).one()
        assert (guest.scheduled_evening_id, guest.name) == (se.id, "Anna Gast")
        (_, to, subject, text, _html), _ = send.call_args
        assert to == "anna@example.com"
        assert subject == "Du bist dabei: Gastkegeln am 14.11.2099"
        assert "Samstag, 14. November 2099 um 20:00 Uhr" in text
        assert "Ort: Altes Schalthaus" in text

    def test_member_rejects_and_mails(self, client, db, club, auth_headers):
        se = _evening(db, club, days=None)
        req = _request(db, club, se)
        r, send = self._decide(client, auth_headers, req.id, "reject")
        assert r.status_code == 200
        assert r.json()["status"] == "rejected"
        assert db.query(ScheduledEveningGuest).count() == 0
        assert send.call_args[0][2] == "Deine Anfrage zum Gastkegeln am 14.11.2099"

    def test_without_smtp_decision_is_saved_but_reported(self, client, db, club, auth_headers):
        req = _request(db, club, _evening(db, club))
        r, send = self._decide(client, auth_headers, req.id, "approve", smtp=None)
        assert r.status_code == 200
        assert r.json()["guest_notified"] is False
        send.assert_not_called()

    def test_failing_smtp_is_reported_not_raised(self, client, db, club, auth_headers):
        req = _request(db, club, _evening(db, club))
        with patch("api.v1.guest_requests.get_club_email_config", return_value=SMTP), \
             patch("api.v1.guest_requests.send_club_email", side_effect=OSError("down")):
            r = client.post(f"/api/v1/guest-requests/{req.id}/reject", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["guest_notified"] is False

    def test_already_decided_is_400(self, client, db, club, auth_headers):
        req = _request(db, club, _evening(db, club), status="approved")
        r, _ = self._decide(client, auth_headers, req.id, "reject")
        assert r.status_code == 400

    def test_cancelled_evening_can_only_be_rejected(self, client, db, club, auth_headers):
        req = _request(db, club, _evening(db, club, is_deleted=True))
        assert self._decide(client, auth_headers, req.id, "approve")[0].status_code == 400
        assert self._decide(client, auth_headers, req.id, "reject")[0].status_code == 200

    def test_unknown_or_foreign_request_is_404(self, client, auth_headers):
        assert self._decide(client, auth_headers, 999999, "approve")[0].status_code == 404

    def test_requires_login(self, client, db, club):
        req = _request(db, club, _evening(db, club))
        assert client.post(f"/api/v1/guest-requests/{req.id}/approve").status_code == 401


# ── Notification category ───────────────────────────────────────────────────

class TestGuestRequestCategory:
    def test_defaults_to_email(self, user: User):
        user.push_preferences = {}
        assert _user_channels(user, "guest_requests") == ["email"]
        assert _user_channels(user, "schedule") == ["push"]

    def test_member_can_opt_out(self, client, db, user: User, auth_headers):
        r = client.get("/api/v1/push/preferences", headers=auth_headers)
        assert r.json()["guest_requests"] == ["email"]
        r = client.patch("/api/v1/push/preferences", json={"guest_requests": []}, headers=auth_headers)
        assert r.json()["guest_requests"] == []
        db.refresh(user)
        assert _user_channels(user, "guest_requests") == []

    def test_schedule_toggle_round_trips(self, client, db, club, user: User, auth_headers):
        from models.user import UserRole
        user.role = UserRole.admin
        db.commit()
        with patch("api.v1.schedule.push_to_club"):
            r = client.post("/api/v1/schedule/", json={"date": "2099-11-14T20:00", "guest_requests_enabled": False},
                            headers=auth_headers)
            assert r.json()["guest_requests_enabled"] is False
            r = client.patch(f"/api/v1/schedule/{r.json()['id']}", json={"guest_requests_enabled": True},
                             headers=auth_headers)
        assert r.json()["guest_requests_enabled"] is True

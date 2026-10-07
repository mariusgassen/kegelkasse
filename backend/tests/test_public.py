"""
Tests for the public, unauthenticated schedule API:
  GET /public/clubs/{slug}/schedule

The endpoint has no secret, so the tests focus on what must *not* leak: clubs that haven't opted
in, cancelled/past evenings, and anything personal — attendance is exposed as counts only.
"""
from datetime import datetime, timedelta, UTC

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.club import Club, ClubSettings
from models.evening import RegularMember
from models.schedule import MemberRsvp, RsvpStatus, ScheduledEvening, ScheduledEveningGuest
from models.user import User, UserRole

URL = "/api/v1/public/clubs/test-club/schedule"


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    se_ids = [se.id for se in db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id)]
    if se_ids:
        db.query(MemberRsvp).filter(MemberRsvp.scheduled_evening_id.in_(se_ids)).delete(synchronize_session=False)
        db.query(ScheduledEveningGuest).filter(
            ScheduledEveningGuest.scheduled_evening_id.in_(se_ids)).delete(synchronize_session=False)
    db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


def _settings(db: Session, club: Club, enabled: bool) -> ClubSettings:
    s = ClubSettings(club_id=club.id, extra={"public_schedule_enabled": enabled, "ical_token": "secret"})
    db.add(s)
    db.commit()
    return s


def _evening(db: Session, club: Club, days: float, **kw) -> ScheduledEvening:
    se = ScheduledEvening(club_id=club.id, scheduled_at=datetime.now(UTC) + timedelta(days=days),
                          venue="Kegelstube", note="Geheime Notiz", **kw)
    db.add(se)
    db.commit()
    db.refresh(se)
    return se


class TestPublicSchedule:
    def test_no_auth_required(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, True)
        _evening(db, club, 3)
        r = client.get(URL)
        assert r.status_code == 200
        body = r.json()
        assert body["club"] == "Test Club"
        assert len(body["evenings"]) == 1

    def test_not_opted_in_is_404(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, False)
        _evening(db, club, 3)
        assert client.get(URL).status_code == 404

    def test_no_settings_row_is_404(self, client: TestClient, db: Session, club: Club):
        _evening(db, club, 3)
        assert client.get(URL).status_code == 404

    def test_unknown_slug_is_404(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, True)
        r = client.get("/api/v1/public/clubs/does-not-exist/schedule")
        assert r.status_code == 404
        # Same answer as an existing club that hasn't opted in — slugs can't be probed.
        assert r.json() == {"detail": "Club not found"}

    def test_only_upcoming_non_deleted_sorted(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, True)
        later = _evening(db, club, 14)
        sooner = _evening(db, club, 7)
        _evening(db, club, -7)                    # past
        _evening(db, club, 10, is_deleted=True)   # cancelled
        ids = [e["id"] for e in client.get(URL).json()["evenings"]]
        assert ids == [sooner.id, later.id]

    def test_payload_fields(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, True)
        _evening(db, club, 3)
        evening = client.get(URL).json()["evenings"][0]
        assert set(evening) == {"id", "scheduled_at", "venue", "note", "attendees", "guest_requests_enabled"}
        assert evening["scheduled_at"].endswith("Z")
        assert evening["venue"] == "Kegelstube"
        assert evening["note"] == "Geheime Notiz"

    def test_attendance_is_counted_without_personal_details(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, True)
        se = _evening(db, club, 3)
        members = [RegularMember(club_id=club.id, name=f"Mitglied {i}", nickname=f"Spitz {i}") for i in range(4)]
        guest_rm = RegularMember(club_id=club.id, name="Stammgast", is_guest=True)
        gone = RegularMember(club_id=club.id, name="Ausgetreten", deactivated_at=datetime.now(UTC))
        db.add_all(members + [guest_rm, gone])
        db.commit()
        db.add_all([
            # Opt-out model: no answer counts as attending, explicit "attending" too.
            MemberRsvp(scheduled_evening_id=se.id, regular_member_id=members[0].id, status=RsvpStatus.absent),
            MemberRsvp(scheduled_evening_id=se.id, regular_member_id=members[1].id, status=RsvpStatus.attending),
            ScheduledEveningGuest(scheduled_evening_id=se.id, name="Neuer Gast"),
            ScheduledEveningGuest(scheduled_evening_id=se.id, name="Stammgast", regular_member_id=guest_rm.id),
            # A guest entry for a roster member must not count twice.
            ScheduledEveningGuest(scheduled_evening_id=se.id, name="Spitz 2", regular_member_id=members[2].id),
        ])
        db.commit()
        r = client.get(URL)
        assert r.json()["evenings"][0]["attendees"] == {"members": 3, "guests": 2, "total": 5}
        # Nothing personal anywhere in the response.
        for leaked in ("Mitglied", "Spitz", "Stammgast", "Neuer Gast", "Ausgetreten"):
            assert leaked not in r.text

    @pytest.mark.parametrize("stored, expected", [
        # Stored values are the wall-clock time the admin typed (20:00), in the UTC slot.
        (datetime(2099, 11, 14, 20, 0, tzinfo=UTC), "2099-11-14T19:00:00Z"),  # CET, UTC+1
        (datetime(2099, 7, 11, 20, 0, tzinfo=UTC), "2099-07-11T18:00:00Z"),   # CEST, UTC+2
    ])
    def test_wall_clock_time_is_converted_from_club_timezone(
            self, client: TestClient, db: Session, club: Club, stored, expected):
        _settings(db, club, True)
        db.add(ScheduledEvening(club_id=club.id, scheduled_at=stored))
        db.commit()
        assert client.get(URL).json()["evenings"][0]["scheduled_at"] == expected

    def test_limit(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, True)
        for d in range(1, 6):
            _evening(db, club, d)
        assert len(client.get(URL, params={"limit": 2}).json()["evenings"]) == 2
        assert client.get(URL, params={"limit": 0}).status_code == 422
        assert client.get(URL, params={"limit": 101}).status_code == 422

    def test_cors_and_cache_headers(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, True)
        r = client.get(URL, headers={"Origin": "https://www.kc-eichhorn.de"})
        assert r.headers["access-control-allow-origin"] == "*"
        assert "max-age" in r.headers["cache-control"]

    def test_other_clubs_evenings_not_included(self, client: TestClient, db: Session, club: Club):
        _settings(db, club, True)
        other = Club(name="Other", slug="other-club")
        db.add(other)
        db.commit()
        try:
            db.add(ScheduledEvening(club_id=other.id, scheduled_at=datetime.now(UTC) + timedelta(days=2)))
            db.commit()
            assert client.get(URL).json()["evenings"] == []
        finally:
            db.query(ScheduledEvening).filter(ScheduledEvening.club_id == other.id).delete()
            db.delete(other)
            db.commit()


class TestPublicScheduleSetting:
    def test_defaults_off(self, client: TestClient, db: Session, club: Club, auth_headers):
        _settings(db, club, False)
        r = client.get("/api/v1/club/", headers=auth_headers)
        assert r.json()["settings"]["public_schedule_enabled"] is False

    def test_member_cannot_enable(self, client: TestClient, db: Session, club: Club, auth_headers):
        _settings(db, club, False)
        r = client.patch("/api/v1/club/settings", json={"public_schedule_enabled": True}, headers=auth_headers)
        assert r.status_code == 403
        assert client.get(URL).status_code == 404

    def test_admin_enables(self, client: TestClient, db: Session, club: Club, user: User, auth_headers):
        user.role = UserRole.admin
        db.commit()
        _settings(db, club, False)
        _evening(db, club, 3)
        r = client.patch("/api/v1/club/settings", json={"public_schedule_enabled": True}, headers=auth_headers)
        assert r.status_code == 200
        assert client.get(URL).status_code == 200

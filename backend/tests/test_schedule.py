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

    def test_past_date_accepted(self, client: TestClient, admin_headers):
        """Past dates are allowed so admins can backfill evenings."""
        past = (datetime.now(UTC) - timedelta(days=1)).strftime('%Y-%m-%dT%H:%M')
        resp = client.post("/api/v1/schedule/", json={"date": past}, headers=admin_headers)
        assert resp.status_code == 200

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


# ---------------------------------------------------------------------------
# Personal iCal token + RSVP-aware feed
# ---------------------------------------------------------------------------

class TestPersonalIcalToken:
    def test_requires_auth(self, client: TestClient):
        assert client.get("/api/v1/schedule/ical-token").status_code == 401
        assert client.post("/api/v1/schedule/ical-token/regenerate").status_code == 401

    def test_token_is_created_lazily_and_stable(self, client: TestClient, user, auth_headers):
        first = client.get("/api/v1/schedule/ical-token", headers=auth_headers).json()["ical_token"]
        assert len(first) > 20
        assert client.get("/api/v1/schedule/ical-token", headers=auth_headers).json()["ical_token"] == first

    def test_tokens_differ_per_user(self, client: TestClient, user, auth_headers, admin_user, admin_headers):
        a = client.get("/api/v1/schedule/ical-token", headers=auth_headers).json()["ical_token"]
        b = client.get("/api/v1/schedule/ical-token", headers=admin_headers).json()["ical_token"]
        assert a != b

    def test_regenerate_only_invalidates_own_link(self, client: TestClient, user, auth_headers, admin_user,
                                                  admin_headers):
        old = client.get("/api/v1/schedule/ical-token", headers=auth_headers).json()["ical_token"]
        other = client.get("/api/v1/schedule/ical-token", headers=admin_headers).json()["ical_token"]
        new = client.post("/api/v1/schedule/ical-token/regenerate", headers=auth_headers).json()["ical_token"]
        assert new != old
        assert client.get(f"/api/v1/schedule/ical/{old}.ics").status_code == 404
        assert client.get(f"/api/v1/schedule/ical/{new}.ics").status_code == 200
        assert client.get(f"/api/v1/schedule/ical/{other}.ics").status_code == 200


class TestPersonalIcalFeed:
    @pytest.fixture()
    def evenings(self, db, club):
        out = []
        for days in (10, 20, 30):
            se = ScheduledEvening(club_id=club.id, scheduled_at=datetime.now(UTC) + timedelta(days=days),
                                  venue="Bahn", note="Bring Kegel")
            db.add(se)
            out.append(se)
        db.commit()
        return out

    def _feed(self, client, headers):
        token = client.get("/api/v1/schedule/ical-token", headers=headers).json()["ical_token"]
        resp = client.get(f"/api/v1/schedule/ical/{token}.ics")
        assert resp.status_code == 200
        return resp.text.replace("\r\n ", "")

    def test_declined_events_are_cancelled_for_the_member(self, client: TestClient, db, regular_member,
                                                          member_with_roster, evenings):
        db.add(MemberRsvp(scheduled_evening_id=evenings[0].id, regular_member_id=regular_member.id,
                          status="attending"))
        db.add(MemberRsvp(scheduled_evening_id=evenings[1].id, regular_member_id=regular_member.id,
                          status="absent"))
        db.commit()
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(member_with_roster.id)})}"}
        body = self._feed(client, headers)
        events = [e for e in body.split("BEGIN:VEVENT")[1:]]
        by_uid = {e.split("UID:")[1].split("\r\n")[0]: e for e in events}
        attending = by_uid[f"kegelkasse-{evenings[0].id}@kegelkasse"]
        declined = by_uid[f"kegelkasse-{evenings[1].id}@kegelkasse"]
        pending = by_uid[f"kegelkasse-{evenings[2].id}@kegelkasse"]
        assert "STATUS:CANCELLED" in declined
        assert "STATUS:CONFIRMED" in attending and "STATUS:CANCELLED" not in attending
        assert "STATUS:TENTATIVE" in pending and "STATUS:CANCELLED" not in pending
        # Titles stay clean: no status marker in front
        assert body.count("SUMMARY:Kegelabend · Bahn") == 3
        assert "✅" not in body and "❌" not in body and "❓" not in body
        assert "TRANSP" not in body
        assert "Deine Antwort: Zugesagt" in attending
        assert "Deine Antwort: Abgesagt" in declined
        assert "Bring Kegel" in attending

    def test_other_members_rsvp_is_not_leaked(self, client: TestClient, db, regular_member, member_with_roster,
                                              evenings, user, auth_headers):
        db.add(MemberRsvp(scheduled_evening_id=evenings[0].id, regular_member_id=regular_member.id,
                          status="attending"))
        db.commit()
        # `user` has no linked roster member -> plain feed, no per-event marks
        body = self._feed(client, auth_headers)
        assert "STATUS:" not in body
        assert "SUMMARY:Kegelabend · Bahn" in body

    def test_english_locale(self, client: TestClient, db, member_with_roster, evenings):
        member_with_roster.preferred_locale = "en"
        db.commit()
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(member_with_roster.id)})}"}
        body = self._feed(client, headers)
        assert "Bowling evening" in body
        assert "Your answer: No answer yet" in body

    def test_deactivated_user_token_stops_working(self, client: TestClient, db, user, auth_headers):
        token = client.get("/api/v1/schedule/ical-token", headers=auth_headers).json()["ical_token"]
        user.is_active = False
        db.commit()
        assert client.get(f"/api/v1/schedule/ical/{token}.ics").status_code == 404

    def test_legacy_club_token_still_serves_plain_feed(self, client: TestClient, db, club, evenings):
        from models.club import ClubSettings
        db.add(ClubSettings(club_id=club.id, extra={"ical_token": "legacy-club-token"}))
        db.commit()
        body = client.get("/api/v1/schedule/ical/legacy-club-token.ics").text
        assert "SUMMARY:Kegelabend · Bahn" in body
        assert "✅" not in body

    def test_feed_hints_refresh_interval(self, client: TestClient, user, auth_headers):
        assert "REFRESH-INTERVAL;VALUE=DURATION:PT1H" in self._feed(client, auth_headers)


class TestIcalFolding:
    def test_fold_never_splits_a_multibyte_character(self):
        from api.v1.schedule import _ical_fold
        line = "DESCRIPTION:" + "Gäste äöü 🍺 " * 30
        folded = _ical_fold(line)
        assert all(len(part.encode("utf-8")) <= 75 for part in folded.split("\r\n"))
        # Unfolding restores the original exactly
        assert folded.replace("\r\n ", "").rstrip("\r\n") == line

    def test_short_line_is_untouched(self):
        from api.v1.schedule import _ical_fold
        assert _ical_fold("SUMMARY:Kegelabend") == "SUMMARY:Kegelabend\r\n"


class TestIcalEventDetails:
    @pytest.fixture()
    def evening(self, db, club):
        se = ScheduledEvening(club_id=club.id, scheduled_at=datetime.now(UTC) + timedelta(days=10),
                              venue="Bahn", note="Bring Kegel")
        db.add(se)
        db.commit()
        return se

    def _feed(self, client, headers):
        token = client.get("/api/v1/schedule/ical-token", headers=headers).json()["ical_token"]
        return client.get(f"/api/v1/schedule/ical/{token}.ics").text.replace("\r\n ", "")

    def test_description_has_note_attendees_and_app_link(self, client: TestClient, db, club, regular_member,
                                                         member_with_roster, evening):
        from models.schedule import ScheduledEveningGuest
        other = RegularMember(club_id=club.id, name="Anna Absage", nickname="Anna")
        third = RegularMember(club_id=club.id, name="Bernd Dabei")
        db.add_all([other, third])
        db.commit()
        db.add(MemberRsvp(scheduled_evening_id=evening.id, regular_member_id=other.id, status="absent"))
        db.add(ScheduledEveningGuest(scheduled_evening_id=evening.id, name="Gerda Gast"))
        db.commit()
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(member_with_roster.id)})}"}
        body = self._feed(client, headers)
        assert "Bring Kegel" in body
        # Opt-out model: roster members attend unless they declined; nickname wins over name
        assert "Dabei (2): Bernd Dabei\\, Rudi" in body
        assert "Abgesagt (1): Anna" in body
        assert "Gäste (1): Gerda Gast" in body
        assert f"URL:https://testserver/schedule?evening={evening.id}" in body
        assert f"In der App öffnen: https://testserver/schedule?evening={evening.id}" in body

    def test_links_use_the_clubs_configured_base_url(self, client: TestClient, db, club, member_with_roster,
                                                     evening):
        from models.club import ClubSettings
        db.add(ClubSettings(club_id=club.id, extra={"email": {"base_url": "https://kegeln.example.org/"}}))
        db.commit()
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(member_with_roster.id)})}"}
        assert f"URL:https://kegeln.example.org/schedule?evening={evening.id}" in self._feed(client, headers)

    def test_legacy_club_token_feed_has_no_names_or_link(self, client: TestClient, db, club, regular_member,
                                                         evening):
        from models.club import ClubSettings
        db.add(ClubSettings(club_id=club.id, extra={"ical_token": "legacy-tok"}))
        db.commit()
        body = client.get("/api/v1/schedule/ical/legacy-tok.ics").text.replace("\r\n ", "")
        assert "Rudi" not in body and "URL:" not in body
        assert "Bring Kegel" in body

    def test_deleted_event_carries_no_details(self, client: TestClient, db, user, auth_headers, evening):
        evening.is_deleted = True
        db.commit()
        body = self._feed(client, auth_headers)
        assert "STATUS:CANCELLED" in body and "URL:" not in body


class TestIcalTripsAndRsvpLink:
    @pytest.fixture(autouse=True)
    def _clean_trips(self, db, club):
        yield
        from models.committee import ClubTrip
        db.query(ClubTrip).filter(ClubTrip.club_id == club.id).delete(synchronize_session=False)
        db.commit()

    def _trip(self, db, club, date, end=None, destination="Prag", note=None, deleted=False):
        from models.committee import ClubTrip
        t = ClubTrip(club_id=club.id, date=date, end_date=end, destination=destination, note=note,
                     is_deleted=deleted)
        db.add(t)
        db.commit()
        return t

    def _feed(self, client, headers):
        token = client.get("/api/v1/schedule/ical-token", headers=headers).json()["ical_token"]
        return client.get(f"/api/v1/schedule/ical/{token}.ics").text.replace("\r\n ", "")

    @staticmethod
    def _event(body, uid):
        return next(e for e in body.split("BEGIN:VEVENT")[1:] if uid in e)

    def test_single_day_trip_is_an_all_day_event(self, client: TestClient, db, club, user, auth_headers):
        trip = self._trip(db, club, datetime(2030, 9, 15, tzinfo=UTC), note="Mit dem Bus")
        ev = self._event(self._feed(client, auth_headers), f"kegelkasse-trip-{trip.id}@kegelkasse")
        assert "DTSTART;VALUE=DATE:20300915" in ev
        assert "DTEND;VALUE=DATE:20300916" in ev  # exclusive end = day after the last day
        assert "SUMMARY:🚌 Kegelfahrt · Prag" in ev
        assert "Mit dem Bus" in ev
        assert f"URL:https://testserver/committee?tab=trips&item={trip.id}" in ev

    def test_multi_day_trip_spans_the_range(self, client: TestClient, db, club, user, auth_headers):
        trip = self._trip(db, club, datetime(2030, 9, 15, tzinfo=UTC), end=datetime(2030, 9, 17, tzinfo=UTC))
        ev = self._event(self._feed(client, auth_headers), f"kegelkasse-trip-{trip.id}@kegelkasse")
        assert "DTSTART;VALUE=DATE:20300915" in ev
        assert "DTEND;VALUE=DATE:20300918" in ev

    def test_end_date_on_the_same_day_stays_a_single_day(self, client: TestClient, db, club, user, auth_headers):
        trip = self._trip(db, club, datetime(2030, 9, 15, 10, 0, tzinfo=UTC),
                          end=datetime(2030, 9, 15, tzinfo=UTC))
        ev = self._event(self._feed(client, auth_headers), f"kegelkasse-trip-{trip.id}@kegelkasse")
        assert "DTEND;VALUE=DATE:20300916" in ev

    def test_deleted_trip_is_cancelled_without_details(self, client: TestClient, db, club, user, auth_headers):
        trip = self._trip(db, club, datetime(2030, 9, 15, tzinfo=UTC), deleted=True)
        ev = self._event(self._feed(client, auth_headers), f"kegelkasse-trip-{trip.id}@kegelkasse")
        assert "STATUS:CANCELLED" in ev and "URL:" not in ev

    def test_trips_are_only_in_personal_feeds(self, client: TestClient, db, club):
        from models.club import ClubSettings
        self._trip(db, club, datetime(2030, 9, 15, tzinfo=UTC))
        db.add(ClubSettings(club_id=club.id, extra={"ical_token": "legacy-trip-tok"}))
        db.commit()
        assert "kegelkasse-trip-" not in client.get("/api/v1/schedule/ical/legacy-trip-tok.ics").text

    def test_trips_of_other_clubs_are_not_leaked(self, client: TestClient, db, club, user, auth_headers):
        from models.club import Club
        from models.committee import ClubTrip
        other = Club(name="Other", slug="other-trip-club")
        db.add(other)
        db.commit()
        db.add(ClubTrip(club_id=other.id, date=datetime(2030, 9, 15, tzinfo=UTC), destination="Geheim"))
        db.commit()
        try:
            assert "Geheim" not in self._feed(client, auth_headers)
        finally:
            db.query(ClubTrip).filter(ClubTrip.club_id == other.id).delete()
            db.delete(other)
            db.commit()

    # ── RSVP deep link ──

    def _evening(self, db, club, days, deleted=False):
        se = ScheduledEvening(club_id=club.id, scheduled_at=datetime.now(UTC) + timedelta(days=days),
                              venue="Bahn", is_deleted=deleted)
        db.add(se)
        db.commit()
        return se

    def _member_headers(self, member_with_roster):
        return {"Authorization": f"Bearer {create_access_token({'sub': str(member_with_roster.id)})}"}

    def test_future_evening_gets_an_rsvp_link(self, client: TestClient, db, club, member_with_roster):
        se = self._evening(db, club, 10)
        body = self._feed(client, self._member_headers(member_with_roster))
        assert f"Zu-/Absagen: https://testserver/schedule?rsvp={se.id}" in body

    def test_past_and_deleted_evenings_get_no_rsvp_link(self, client: TestClient, db, club, member_with_roster):
        self._evening(db, club, -10)
        self._evening(db, club, 10, deleted=True)
        assert "rsvp=" not in self._feed(client, self._member_headers(member_with_roster))

    def test_no_rsvp_link_without_a_roster_member(self, client: TestClient, db, club, user, auth_headers):
        self._evening(db, club, 10)
        assert "rsvp=" not in self._feed(client, auth_headers)

    def test_legacy_feed_has_no_rsvp_link(self, client: TestClient, db, club):
        from models.club import ClubSettings
        self._evening(db, club, 10)
        db.add(ClubSettings(club_id=club.id, extra={"ical_token": "legacy-rsvp-tok"}))
        db.commit()
        assert "rsvp=" not in client.get("/api/v1/schedule/ical/legacy-rsvp-tok.ics").text

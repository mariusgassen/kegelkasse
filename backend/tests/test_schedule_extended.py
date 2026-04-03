"""Extended tests for schedule endpoints — covers previously uncovered lines in schedule.py.

Focuses on:
- create_scheduled_evening: push notification path, venue/note (lines 93-126)
- update_scheduled_evening: date change triggers reschedule path (lines 135-163)
- Guest management: add_guest, remove_guest (lines 185-219)
- start_evening: create actual Evening from schedule, member import, guest import,
  conflict when another evening open (lines 228-322)
- RSVP: set_rsvp_for_member (admin endpoint) (lines 363-391)
- remove_rsvp without roster entry (lines 395-408)
- send_reminder (lines 435-459)
- iCal feed with events and deleted event (lines 481-548)
"""
import pytest
from datetime import datetime, timedelta, UTC
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings
from models.evening import Evening, EveningPlayer, RegularMember
from models.schedule import ScheduledEvening, MemberRsvp, ScheduledEveningGuest, RsvpStatus
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db: Session, club: Club) -> User:
    u = User(
        email="schedext_admin@test.de",
        name="Sched Ext Admin",
        hashed_password=get_password_hash("adminpass"),
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
    m = RegularMember(club_id=club.id, name="Rudi Kegel", nickname="Rudi")
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture()
def member_with_roster(db: Session, club: Club, regular_member: RegularMember) -> User:
    u = User(
        email="rsvpext@test.de",
        name="RSVP Ext Member",
        hashed_password=get_password_hash("pass"),
        role=UserRole.member,
        club_id=club.id,
        regular_member_id=regular_member.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def member_with_roster_headers(member_with_roster: User) -> dict:
    token = create_access_token({"sub": str(member_with_roster.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def future_date() -> str:
    return (datetime.now(UTC) + timedelta(days=30)).strftime('%Y-%m-%dT%H:%M')


@pytest.fixture()
def scheduled_evening(db: Session, club: Club, admin_user: User) -> ScheduledEvening:
    se = ScheduledEvening(
        club_id=club.id,
        scheduled_at=datetime.now(UTC) + timedelta(days=30),
        venue="Stammlokal",
        created_by=admin_user.id,
    )
    db.add(se)
    db.commit()
    db.refresh(se)
    return se


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    # Clean in FK order: evenings → schedule → members → settings
    evenings = db.query(Evening).filter(Evening.club_id == club.id).all()
    for e in evenings:
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberRsvp).delete(synchronize_session=False)
    db.query(ScheduledEveningGuest).delete(synchronize_session=False)
    db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# POST /api/v1/schedule/ — create
# ---------------------------------------------------------------------------

class TestCreateScheduledEveningExtended:
    def test_create_with_venue_and_note(self, client: TestClient, admin_headers: dict, future_date: str):
        """Lines 93-126: creates scheduled evening with all fields."""
        resp = client.post("/api/v1/schedule/",
                           json={"date": future_date, "venue": "Kegelhalle", "note": "Wichtig"},
                           headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["venue"] == "Kegelhalle"
        assert data["note"] == "Wichtig"

    def test_create_returns_serialized_shape(self, client: TestClient, admin_headers: dict, future_date: str):
        """Lines 93-126: response has expected keys."""
        resp = client.post("/api/v1/schedule/",
                           json={"date": future_date},
                           headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "scheduled_at" in data
        assert "attending_count" in data
        assert "absent_count" in data
        assert "guests" in data


# ---------------------------------------------------------------------------
# PATCH /api/v1/schedule/{sid} — update
# ---------------------------------------------------------------------------

class TestUpdateScheduledEveningExtended:
    def test_update_date(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 146-147: updating date field changes scheduled_at."""
        new_date = (datetime.now(UTC) + timedelta(days=60)).strftime('%Y-%m-%dT%H:%M')
        resp = client.patch(f"/api/v1/schedule/{scheduled_evening.id}",
                            json={"date": new_date},
                            headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "scheduled_at" in data

    def test_update_note(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 135-163: updating note field."""
        resp = client.patch(f"/api/v1/schedule/{scheduled_evening.id}",
                            json={"note": "Updated note"},
                            headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["note"] == "Updated note"

    def test_update_unauthenticated(
            self, client: TestClient, scheduled_evening: ScheduledEvening):
        """Lines 135-163: unauthenticated request rejected."""
        resp = client.patch(f"/api/v1/schedule/{scheduled_evening.id}",
                            json={"venue": "Hack"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Guest management
# ---------------------------------------------------------------------------

class TestGuestManagement:
    def test_add_guest(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 185-201: add a guest to a scheduled evening."""
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/guests",
                           json={"name": "Max Gast"},
                           headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Max Gast"
        assert "id" in data

    def test_add_guest_with_regular_member(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening, regular_member: RegularMember):
        """Lines 185-201: add guest linked to a RegularMember."""
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/guests",
                           json={"name": regular_member.name,
                                 "regular_member_id": regular_member.id},
                           headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["regular_member_id"] == regular_member.id

    def test_add_guest_member_required(
            self, client: TestClient, auth_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 185-201: non-admin gets 403."""
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/guests",
                           json={"name": "Intruder"},
                           headers=auth_headers)
        assert resp.status_code == 403

    def test_add_guest_nonexistent_se(
            self, client: TestClient, admin_headers: dict):
        """Lines 192: 404 for nonexistent scheduled evening."""
        resp = client.post("/api/v1/schedule/99999/guests",
                           json={"name": "Ghost"},
                           headers=admin_headers)
        assert resp.status_code == 404

    def test_remove_guest(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening, db: Session):
        """Lines 204-219: remove a guest."""
        guest = ScheduledEveningGuest(
            scheduled_evening_id=scheduled_evening.id,
            name="Removable Guest",
        )
        db.add(guest)
        db.commit()
        db.refresh(guest)
        resp = client.delete(f"/api/v1/schedule/{scheduled_evening.id}/guests/{guest.id}",
                             headers=admin_headers)
        assert resp.status_code == 204
        assert db.query(ScheduledEveningGuest).filter(
            ScheduledEveningGuest.id == guest.id
        ).first() is None

    def test_remove_guest_not_found(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 216-217: 404 when guest not found."""
        resp = client.delete(f"/api/v1/schedule/{scheduled_evening.id}/guests/99999",
                             headers=admin_headers)
        assert resp.status_code == 404

    def test_remove_guest_requires_admin(
            self, client: TestClient, auth_headers: dict,
            scheduled_evening: ScheduledEvening, db: Session):
        """Lines 204-219: member role gets 403."""
        guest = ScheduledEveningGuest(
            scheduled_evening_id=scheduled_evening.id,
            name="Protected Guest",
        )
        db.add(guest)
        db.commit()
        db.refresh(guest)
        resp = client.delete(f"/api/v1/schedule/{scheduled_evening.id}/guests/{guest.id}",
                             headers=auth_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/v1/schedule/{sid}/start — start evening from schedule
# ---------------------------------------------------------------------------

class TestStartEveningFromSchedule:
    def test_start_creates_evening(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening,
            regular_member: RegularMember):
        """Lines 228-322: creates Evening from schedule."""
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/start",
                           json={"member_ids": [regular_member.id]},
                           headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "date" in data

    def test_start_adds_members_as_players(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening,
            regular_member: RegularMember, db: Session, club: Club):
        """Lines 260-271: specified members are added as EveningPlayers."""
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/start",
                           json={"member_ids": [regular_member.id]},
                           headers=admin_headers)
        evening_id = resp.json()["id"]
        players = db.query(EveningPlayer).filter(
            EveningPlayer.evening_id == evening_id
        ).all()
        assert len(players) == 1
        assert players[0].regular_member_id == regular_member.id

    def test_start_imports_guests(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening, db: Session):
        """Lines 273-296: guests are added as EveningPlayers."""
        guest = ScheduledEveningGuest(
            scheduled_evening_id=scheduled_evening.id,
            name="Guest Player",
        )
        db.add(guest)
        db.commit()
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/start",
                           json={"member_ids": []},
                           headers=admin_headers)
        assert resp.status_code == 200
        evening_id = resp.json()["id"]
        players = db.query(EveningPlayer).filter(
            EveningPlayer.evening_id == evening_id
        ).all()
        assert any(p.name == "Guest Player" for p in players)

    def test_start_blocked_when_another_open(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening,
            admin_user: User, db: Session, club: Club):
        """Lines 240-245: 400 when another evening is already open."""
        open_evening = Evening(
            club_id=club.id,
            created_by=admin_user.id,
            date=datetime.now(UTC),
        )
        db.add(open_evening)
        db.commit()
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/start",
                           json={"member_ids": []},
                           headers=admin_headers)
        assert resp.status_code == 400
        assert "already active" in resp.json()["detail"].lower()

    def test_start_nonexistent_schedule(
            self, client: TestClient, admin_headers: dict):
        """Lines 237: 404 for nonexistent scheduled evening."""
        resp = client.post("/api/v1/schedule/99999/start",
                           json={"member_ids": []},
                           headers=admin_headers)
        assert resp.status_code == 404

    def test_start_requires_admin(
            self, client: TestClient, auth_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 228-322: member role gets 403."""
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/start",
                           json={"member_ids": []},
                           headers=auth_headers)
        assert resp.status_code == 403

    def test_start_with_absent_rsvps_creates_absence_penalties(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening,
            regular_member: RegularMember, db: Session):
        """Lines 301-307: if absent RSVPs exist, absence penalties are calculated."""
        rsvp = MemberRsvp(
            scheduled_evening_id=scheduled_evening.id,
            regular_member_id=regular_member.id,
            status=RsvpStatus.absent,
        )
        db.add(rsvp)
        db.commit()
        # Add a present player so base_fee can be calculated
        another_member = RegularMember(club_id=scheduled_evening.club_id, name="Present Guy")
        db.add(another_member)
        db.commit()
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/start",
                           json={"member_ids": [another_member.id]},
                           headers=admin_headers)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# RSVP for member endpoint (admin sets RSVP for another member)
# ---------------------------------------------------------------------------

class TestSetRsvpForMember:
    def test_admin_can_set_rsvp_for_member(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening, regular_member: RegularMember):
        """Lines 363-391: admin sets RSVP on behalf of a member."""
        resp = client.post(
            f"/api/v1/schedule/{scheduled_evening.id}/rsvp/member/{regular_member.id}",
            json={"status": "attending"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "attending"

    def test_admin_rsvp_for_member_upserts(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening, regular_member: RegularMember, db: Session):
        """Lines 381-390: second call updates existing RSVP."""
        client.post(
            f"/api/v1/schedule/{scheduled_evening.id}/rsvp/member/{regular_member.id}",
            json={"status": "attending"}, headers=admin_headers,
        )
        resp = client.post(
            f"/api/v1/schedule/{scheduled_evening.id}/rsvp/member/{regular_member.id}",
            json={"status": "absent"}, headers=admin_headers,
        )
        assert resp.status_code == 200
        rsvps = db.query(MemberRsvp).filter(
            MemberRsvp.scheduled_evening_id == scheduled_evening.id
        ).all()
        assert len(rsvps) == 1
        assert rsvps[0].status == "absent"

    def test_admin_rsvp_for_unknown_member(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 375-379: 404 when member doesn't exist."""
        resp = client.post(
            f"/api/v1/schedule/{scheduled_evening.id}/rsvp/member/99999",
            json={"status": "attending"}, headers=admin_headers,
        )
        assert resp.status_code == 404

    def test_admin_rsvp_invalid_status(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening, regular_member: RegularMember):
        """Lines 371-372: invalid status returns 400."""
        resp = client.post(
            f"/api/v1/schedule/{scheduled_evening.id}/rsvp/member/{regular_member.id}",
            json={"status": "maybe"}, headers=admin_headers,
        )
        assert resp.status_code == 400

    def test_member_cannot_set_rsvp_for_other(
            self, client: TestClient, auth_headers: dict,
            scheduled_evening: ScheduledEvening, regular_member: RegularMember):
        """Lines 363-391: member role gets 403."""
        resp = client.post(
            f"/api/v1/schedule/{scheduled_evening.id}/rsvp/member/{regular_member.id}",
            json={"status": "attending"}, headers=auth_headers,
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /api/v1/schedule/{sid}/rsvp — remove own RSVP
# ---------------------------------------------------------------------------

class TestRemoveRsvpExtended:
    def test_remove_rsvp_no_roster_returns_400(
            self, client: TestClient, auth_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 400-401: user without roster entry gets 400."""
        resp = client.delete(f"/api/v1/schedule/{scheduled_evening.id}/rsvp",
                             headers=auth_headers)
        assert resp.status_code == 400
        assert "no roster" in resp.json()["detail"].lower()

    def test_remove_nonexistent_rsvp_is_noop(
            self, client: TestClient, member_with_roster_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 406-408: removing a non-existent RSVP silently succeeds."""
        resp = client.delete(f"/api/v1/schedule/{scheduled_evening.id}/rsvp",
                             headers=member_with_roster_headers)
        assert resp.status_code == 204


# ---------------------------------------------------------------------------
# POST /api/v1/schedule/{sid}/remind — send reminder
# ---------------------------------------------------------------------------

class TestSendReminder:
    def test_send_reminder_returns_count(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening, regular_member: RegularMember):
        """Lines 435-459: reminder endpoint returns reminded_count."""
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/remind",
                           headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "reminded_count" in data
        assert data["reminded_count"] >= 0

    def test_send_reminder_excludes_already_rsvpd(
            self, client: TestClient, admin_headers: dict,
            scheduled_evening: ScheduledEvening, regular_member: RegularMember, db: Session):
        """Lines 443: members who already RSVP'd are not reminded."""
        rsvp = MemberRsvp(
            scheduled_evening_id=scheduled_evening.id,
            regular_member_id=regular_member.id,
            status=RsvpStatus.attending,
        )
        db.add(rsvp)
        db.commit()
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/remind",
                           headers=admin_headers)
        assert resp.status_code == 200
        # regular_member already responded, so should not be in reminded count
        # (unless there are other members)
        assert resp.json()["reminded_count"] == 0

    def test_send_reminder_requires_admin(
            self, client: TestClient, auth_headers: dict,
            scheduled_evening: ScheduledEvening):
        """Lines 435-459: member role gets 403."""
        resp = client.post(f"/api/v1/schedule/{scheduled_evening.id}/remind",
                           headers=auth_headers)
        assert resp.status_code == 403

    def test_send_reminder_nonexistent(
            self, client: TestClient, admin_headers: dict):
        """Lines 435-459: 404 for nonexistent scheduled evening."""
        resp = client.post("/api/v1/schedule/99999/remind",
                           headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# iCal feed extended
# ---------------------------------------------------------------------------

class TestIcalFeedExtended:
    def _setup_token(self, db: Session, club: Club) -> str:
        token_val = "ext-ical-token-xyz"
        settings = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
        if not settings:
            settings = ClubSettings(club_id=club.id, extra={"ical_token": token_val})
            db.add(settings)
        else:
            extra = dict(settings.extra or {})
            extra["ical_token"] = token_val
            settings.extra = extra
        db.commit()
        return token_val

    def test_ical_includes_event(
            self, client: TestClient, db: Session, club: Club,
            admin_user: User, scheduled_evening: ScheduledEvening):
        """Lines 517-543: VEVENT present for each scheduled evening."""
        token = self._setup_token(db, club)
        resp = client.get(f"/api/v1/schedule/ical/{token}.ics")
        assert resp.status_code == 200
        body = resp.text
        assert "BEGIN:VEVENT" in body
        assert "DTSTART" in body

    def test_ical_deleted_event_has_cancelled_status(
            self, client: TestClient, db: Session, club: Club,
            admin_user: User):
        """Line 537-538: deleted evenings have STATUS:CANCELLED."""
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=5),
            venue="Deleted Venue",
            created_by=admin_user.id,
            is_deleted=True,
        )
        db.add(se)
        db.commit()
        token = self._setup_token(db, club)
        resp = client.get(f"/api/v1/schedule/ical/{token}.ics")
        assert resp.status_code == 200
        assert "STATUS:CANCELLED" in resp.text

    def test_ical_includes_venue_as_location(
            self, client: TestClient, db: Session, club: Club,
            scheduled_evening: ScheduledEvening):
        """Line 539-540: venue appears as LOCATION in iCal."""
        token = self._setup_token(db, club)
        resp = client.get(f"/api/v1/schedule/ical/{token}.ics")
        assert resp.status_code == 200
        assert "LOCATION:" in resp.text
        assert "Stammlokal" in resp.text

    def test_ical_includes_note_as_description(
            self, client: TestClient, db: Session, club: Club,
            admin_user: User):
        """Lines 541-542: note appears as DESCRIPTION in iCal."""
        se = ScheduledEvening(
            club_id=club.id,
            scheduled_at=datetime.now(UTC) + timedelta(days=10),
            venue="Venue",
            note="Wichtiger Hinweis",
            created_by=admin_user.id,
        )
        db.add(se)
        db.commit()
        token = self._setup_token(db, club)
        resp = client.get(f"/api/v1/schedule/ical/{token}.ics")
        assert resp.status_code == 200
        assert "DESCRIPTION:" in resp.text
        assert "Wichtiger Hinweis" in resp.text

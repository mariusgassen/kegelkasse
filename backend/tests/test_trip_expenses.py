"""
Club expenses linked to a Kegelfahrt:
  trip_id on POST/PATCH /club/expenses and POST /club/member-payments (as_club_expense)
  GET /committee/trips (expense_count / expense_total)
  GET /committee/trips/{tid}/expenses
"""
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.committee import ClubTrip
from models.evening import RegularMember
from models.payment import ClubExpense, MemberPayment
from models.user import User, UserRole


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubTrip).filter(ClubTrip.club_id == club.id).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


def _headers(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


def _user(db, club, email, role) -> User:
    u = User(email=email, name=email.split("@")[0], hashed_password=get_password_hash("x"), role=role,
             club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def admin(db, club):
    return _headers(_user(db, club, "admin@trip.de", UserRole.admin))


@pytest.fixture()
def member(db, club):
    return _headers(_user(db, club, "member@trip.de", UserRole.member))


@pytest.fixture()
def bernd(db, club):
    rm = RegularMember(club_id=club.id, name="Bernd", nickname="Bernie", is_active=True)
    db.add(rm)
    db.commit()
    db.refresh(rm)
    return rm


def _trip(db, club, destination="Winterberg") -> ClubTrip:
    t = ClubTrip(club_id=club.id, date=datetime(2026, 9, 1, tzinfo=timezone.utc), destination=destination)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@pytest.fixture()
def trip(db, club):
    return _trip(db, club)


def _expense(client, headers, **body):
    return client.post("/api/v1/club/expenses", json={"amount": 100, "description": "Bus", **body}, headers=headers)


class TestLinkExpense:
    def test_expense_carries_trip(self, client, admin, trip):
        r = _expense(client, admin, trip_id=trip.id)
        assert r.status_code == 201
        assert r.json()["trip_id"] == trip.id

    def test_expense_without_trip(self, client, admin):
        assert _expense(client, admin).json()["trip_id"] is None

    def test_unknown_or_deleted_trip_rejected(self, client, db, admin, trip):
        assert _expense(client, admin, trip_id=999999).status_code == 400
        trip.is_deleted = True
        db.commit()
        assert _expense(client, admin, trip_id=trip.id).status_code == 400

    def test_foreign_club_trip_rejected(self, client, db, admin):
        other = Club(name="Other", slug="other-trip-link")
        db.add(other)
        db.commit()
        try:
            t = _trip(db, other)
            assert _expense(client, admin, trip_id=t.id).status_code == 400
        finally:
            db.query(ClubTrip).filter(ClubTrip.club_id == other.id).delete(synchronize_session=False)
            db.delete(other)
            db.commit()

    def test_patch_sets_and_clears_trip(self, client, admin, trip):
        eid = _expense(client, admin).json()["id"]
        r = client.patch(f"/api/v1/club/expenses/{eid}", json={"trip_id": trip.id}, headers=admin)
        assert r.json()["trip_id"] == trip.id
        # Omitting trip_id leaves the link alone
        r = client.patch(f"/api/v1/club/expenses/{eid}", json={"amount": 50}, headers=admin)
        assert r.json()["trip_id"] == trip.id
        r = client.patch(f"/api/v1/club/expenses/{eid}", json={"trip_id": None}, headers=admin)
        assert r.json()["trip_id"] is None

    def test_member_cannot_book(self, client, member, trip):
        assert _expense(client, member, trip_id=trip.id).status_code == 403

    def test_payment_as_club_expense_links_trip(self, client, db, club, admin, bernd, trip):
        r = client.post("/api/v1/club/member-payments", json={
            "regular_member_id": bernd.id, "amount": 40, "note": "Tanken", "as_club_expense": True,
            "trip_id": trip.id}, headers=admin)
        assert r.status_code == 201
        exp = db.query(ClubExpense).filter(ClubExpense.club_id == club.id).one()
        assert exp.trip_id == trip.id

    def test_trip_on_plain_deposit_rejected(self, client, admin, bernd, trip):
        r = client.post("/api/v1/club/member-payments", json={
            "regular_member_id": bernd.id, "amount": 40, "trip_id": trip.id}, headers=admin)
        assert r.status_code == 400


class TestTripExpenses:
    def test_trip_list_rolls_up_linked_expenses(self, client, db, club, admin, member, trip):
        other = _trip(db, club, "Köln")
        _expense(client, admin, amount=100, trip_id=trip.id)
        _expense(client, admin, amount=25.5, trip_id=trip.id)
        eid = _expense(client, admin, amount=10, trip_id=trip.id).json()["id"]
        client.delete(f"/api/v1/club/expenses/{eid}", headers=admin)
        _expense(client, admin, amount=999)  # unlinked
        trips = {t["id"]: t for t in client.get("/api/v1/committee/trips", headers=member).json()}
        assert (trips[trip.id]["expense_count"], trips[trip.id]["expense_total"]) == (2, 125.5)
        assert (trips[other.id]["expense_count"], trips[other.id]["expense_total"]) == (0, 0)

    def test_lists_expenses_with_payer(self, client, admin, member, bernd, trip):
        _expense(client, admin, amount=100, description="Bus", date="2026-08-01", trip_id=trip.id)
        client.post("/api/v1/club/member-payments", json={
            "regular_member_id": bernd.id, "amount": 40, "note": "Tanken", "date": "2026-09-01",
            "as_club_expense": True, "trip_id": trip.id}, headers=admin)
        r = client.get(f"/api/v1/committee/trips/{trip.id}/expenses", headers=member)
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 140
        assert [(e["description"], e["paid_by_name"]) for e in body["expenses"]] == [("Tanken", "Bernie"), ("Bus", None)]

    def test_requires_auth_and_known_trip(self, client, member, trip):
        assert client.get(f"/api/v1/committee/trips/{trip.id}/expenses").status_code == 401
        assert client.get("/api/v1/committee/trips/999999/expenses", headers=member).status_code == 404



class TestAddTripExpense:
    def _url(self, trip):
        return f"/api/v1/committee/trips/{trip.id}/expenses"

    def test_books_deposit_and_linked_expense(self, client, db, club, admin, bernd, trip):
        r = client.post(self._url(trip), json={
            "paid_by_member_id": bernd.id, "amount": 40, "description": "Tanken", "date": "2026-09-01"}, headers=admin)
        assert r.status_code == 201
        exp = db.query(ClubExpense).filter(ClubExpense.club_id == club.id).one()
        pay = db.query(MemberPayment).filter(MemberPayment.club_id == club.id).one()
        assert exp.trip_id == trip.id and exp.amount == 40
        assert pay.regular_member_id == bernd.id and pay.amount == 40
        assert pay.transfer_group_id == exp.transfer_group_id
        body = r.json()
        assert body["total"] == 40
        assert body["by_payer"] == [{"member_id": bernd.id, "name": "Bernie", "total": 40}]
        assert body["expenses"][0]["paid_by_member_id"] == bernd.id

    def test_sums_per_payer_and_total(self, client, db, club, admin, bernd, trip):
        carla = RegularMember(club_id=club.id, name="Carla", is_active=True)
        db.add(carla)
        db.commit()
        for who, amt in [(bernd, 40), (carla, 100), (bernd, 25.5)]:
            client.post(self._url(trip), json={"paid_by_member_id": who.id, "amount": amt, "description": "x"}, headers=admin)
        _expense(client, admin, amount=10, trip_id=trip.id)  # club paid directly, no payer
        body = client.get(self._url(trip), headers=admin).json()
        assert body["total"] == 175.5
        assert [(p["name"], p["total"]) for p in body["by_payer"]] == [("Carla", 100), ("Bernie", 65.5)]

    def test_committee_member_allowed_plain_member_not(self, client, db, club, bernd, trip, member):
        assert client.post(self._url(trip), json={
            "paid_by_member_id": bernd.id, "amount": 5, "description": "x"}, headers=member).status_code == 403
        bernd.is_committee = True
        u = _user(db, club, "va@trip.de", UserRole.member)
        u.regular_member_id = bernd.id
        db.commit()
        assert client.post(self._url(trip), json={
            "paid_by_member_id": bernd.id, "amount": 5, "description": "x"}, headers=_headers(u)).status_code == 201

    def test_validation(self, client, admin, bernd, trip):
        ok = {"paid_by_member_id": bernd.id, "amount": 5, "description": "x"}
        assert client.post(self._url(trip), json={**ok, "amount": 0}, headers=admin).status_code == 400
        assert client.post(self._url(trip), json={**ok, "amount": -3}, headers=admin).status_code == 400
        assert client.post(self._url(trip), json={**ok, "paid_by_member_id": 999999}, headers=admin).status_code == 400
        assert client.post(self._url(trip), json={**ok, "description": "  "}, headers=admin).status_code == 400
        assert client.post(self._url(trip), json={**ok, "date": "nope"}, headers=admin).status_code == 400
        assert client.post("/api/v1/committee/trips/999999/expenses", json=ok, headers=admin).status_code == 404
        assert client.post(self._url(trip), json=ok).status_code == 401

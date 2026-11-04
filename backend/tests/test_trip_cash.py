"""
Tests for the Kegelfahrt-Kasse (trip cash box):
  GET    /committee/trips/{tid}/cash
  PUT    /committee/trips/{tid}/cash/participants
  POST   /committee/trips/{tid}/cash/expenses
  DELETE /committee/trips/{tid}/cash/expenses/{eid}
plus the pure split / balance / settle-up math.
"""
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from api.v1.trip_cash import compute_balances, settle, split_cents
from core.security import create_access_token, get_password_hash
from models.club import Club
from models.committee import ClubTrip, TripExpense, TripParticipant
from models.evening import RegularMember
from models.user import User, UserRole


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    trip_ids = [t.id for t in db.query(ClubTrip).filter(ClubTrip.club_id == club.id).all()]
    if trip_ids:
        db.query(TripExpense).filter(TripExpense.trip_id.in_(trip_ids)).delete(synchronize_session=False)
        db.query(TripParticipant).filter(TripParticipant.trip_id.in_(trip_ids)).delete(synchronize_session=False)
    db.query(ClubTrip).filter(ClubTrip.club_id == club.id).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id).update({User.regular_member_id: None}, synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


def _headers(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


def _member(db, club, name, **kw) -> RegularMember:
    rm = RegularMember(club_id=club.id, name=name, is_active=True, **kw)
    db.add(rm)
    db.commit()
    db.refresh(rm)
    return rm


def _user(db, club, email, member=None, role=UserRole.member) -> User:
    u = User(email=email, name=email.split("@")[0], hashed_password=get_password_hash("x"), role=role,
             club_id=club.id, is_active=True, regular_member_id=member.id if member else None)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def trip(db, club):
    t = ClubTrip(club_id=club.id, date=datetime(2026, 9, 1, tzinfo=timezone.utc), destination="Winterberg")
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@pytest.fixture()
def crew(db, club):
    """Anna (committee), Bernd, Carla — all with logins; plus an admin without a member."""
    anna = _member(db, club, "Anna", is_committee=True)
    bernd = _member(db, club, "Bernd")
    carla = _member(db, club, "Carla")
    return {
        "anna": anna, "bernd": bernd, "carla": carla,
        "u_anna": _user(db, club, "anna@trip.de", anna),
        "u_bernd": _user(db, club, "bernd@trip.de", bernd),
        "u_carla": _user(db, club, "carla@trip.de", carla),
        "u_admin": _user(db, club, "admin@trip.de", role=UserRole.admin),
    }


def _url(trip, suffix=""):
    return f"/api/v1/committee/trips/{trip.id}/cash{suffix}"


def _join_all(client, trip, crew):
    ids = [crew["anna"].id, crew["bernd"].id, crew["carla"].id]
    r = client.put(_url(trip, "/participants"), json={"member_ids": ids}, headers=_headers(crew["u_anna"]))
    assert r.status_code == 200, r.text
    return ids


def _book(client, trip, who, **body):
    return client.post(_url(trip, "/expenses"), json=body, headers=_headers(who))


# ── pure math ─────────────────────────────────────────────────────────────────

class TestMath:
    def test_split_hands_remainder_to_lowest_ids(self):
        assert split_cents(1000, [3, 1, 2]) == {1: 334, 2: 333, 3: 333}
        assert sum(split_cents(1001, [5, 6, 7, 8]).values()) == 1001

    def test_balances_sum_to_zero_and_transfers_shift_both(self):
        b = compute_balances([1, 2, 3], [
            {"kind": "expense", "amount_cents": 9000, "paid_by": 1, "to": None, "split": None},
            {"kind": "transfer", "amount_cents": 3000, "paid_by": 2, "to": 1, "split": None},
        ])
        assert b[1]["balance"] == 9000 - 3000 - 3000
        assert b[2]["balance"] == 3000 - 3000
        assert b[3]["balance"] == -3000
        assert sum(r["balance"] for r in b.values()) == 0

    def test_settle_minimises_payments(self):
        payments = settle({1: 6000, 2: -2000, 3: -4000})
        assert payments == [
            {"from_member_id": 3, "to_member_id": 1, "amount_cents": 4000},
            {"from_member_id": 2, "to_member_id": 1, "amount_cents": 2000},
        ]
        assert settle({1: 0, 2: 0}) == []


# ── endpoints ─────────────────────────────────────────────────────────────────

class TestTripCash:
    def test_requires_auth(self, client, trip):
        assert client.get(_url(trip)).status_code == 401

    def test_empty_cash_box(self, client, trip, crew):
        r = client.get(_url(trip), headers=_headers(crew["u_bernd"]))
        assert r.status_code == 200
        body = r.json()
        assert body["participants"] == [] and body["expenses"] == [] and body["settlements"] == []
        assert body["can_manage"] is False and body["can_add"] is False

    def test_unknown_trip_404(self, client, crew):
        assert client.get("/api/v1/committee/trips/999999/cash", headers=_headers(crew["u_anna"])).status_code == 404

    def test_only_committee_or_admin_sets_participants(self, client, trip, crew):
        r = client.put(_url(trip, "/participants"), json={"member_ids": [crew["bernd"].id]},
                       headers=_headers(crew["u_bernd"]))
        assert r.status_code == 403
        r = client.put(_url(trip, "/participants"), json={"member_ids": [crew["bernd"].id]},
                       headers=_headers(crew["u_admin"]))
        assert r.status_code == 200
        assert [p["id"] for p in r.json()["participants"]] == [crew["bernd"].id]

    def test_unknown_participant_rejected(self, client, trip, crew):
        r = client.put(_url(trip, "/participants"), json={"member_ids": [999999]}, headers=_headers(crew["u_anna"]))
        assert r.status_code == 400

    def test_expense_split_and_settlement(self, client, trip, crew):
        _join_all(client, trip, crew)
        r = _book(client, trip, crew["u_bernd"], description="Bus", amount=90, paid_by_member_id=crew["bernd"].id)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["total"] == 90
        bal = {b["id"]: b["balance"] for b in body["balances"]}
        assert bal == {crew["anna"].id: -30, crew["bernd"].id: 60, crew["carla"].id: -30}
        assert sorted((s["from_member_id"], s["amount"]) for s in body["settlements"]) == \
            sorted([(crew["anna"].id, 30), (crew["carla"].id, 30)])
        assert all(s["to_member_id"] == crew["bernd"].id for s in body["settlements"])

    def test_partial_split(self, client, trip, crew):
        _join_all(client, trip, crew)
        r = _book(client, trip, crew["u_anna"], description="Bier", amount=10, paid_by_member_id=crew["anna"].id,
                  split_member_ids=[crew["anna"].id, crew["carla"].id])
        bal = {b["id"]: b["balance"] for b in r.json()["balances"]}
        assert bal == {crew["anna"].id: 5, crew["bernd"].id: 0, crew["carla"].id: -5}

    def test_uneven_split_adds_up(self, client, trip, crew):
        _join_all(client, trip, crew)
        r = _book(client, trip, crew["u_anna"], description="Taxi", amount=10, paid_by_member_id=crew["anna"].id)
        balances = r.json()["balances"]
        assert round(sum(b["balance"] for b in balances), 2) == 0
        assert sorted(b["share"] for b in balances) == [3.33, 3.33, 3.34]

    def test_transfer_settles_debt(self, client, trip, crew):
        _join_all(client, trip, crew)
        _book(client, trip, crew["u_bernd"], description="Bus", amount=90, paid_by_member_id=crew["bernd"].id)
        r = _book(client, trip, crew["u_carla"], kind="transfer", description="Zurück", amount=30,
                  paid_by_member_id=crew["carla"].id, to_member_id=crew["bernd"].id)
        assert r.status_code == 201
        body = r.json()
        assert body["total"] == 90  # transfers are not costs
        bal = {b["id"]: b["balance"] for b in body["balances"]}
        assert bal[crew["carla"].id] == 0 and bal[crew["bernd"].id] == 30
        assert body["settlements"] == [
            {"from_member_id": crew["anna"].id, "to_member_id": crew["bernd"].id, "amount": 30.0}]

    def test_non_participant_cannot_book(self, client, trip, crew, db, club):
        _join_all(client, trip, crew)
        outsider = _member(db, club, "Olaf")
        u = _user(db, club, "olaf@trip.de", outsider)
        r = _book(client, trip, u, description="X", amount=5, paid_by_member_id=crew["anna"].id)
        assert r.status_code == 403

    def test_validation(self, client, trip, crew):
        _join_all(client, trip, crew)
        h = crew["u_bernd"]
        bernd = crew["bernd"].id
        assert _book(client, trip, h, description="X", amount=0, paid_by_member_id=bernd).status_code == 400
        assert _book(client, trip, h, description="X", amount=-5, paid_by_member_id=bernd).status_code == 400
        assert _book(client, trip, h, description="X", amount=5, paid_by_member_id=999999).status_code == 400
        assert _book(client, trip, h, description="X", amount=5, paid_by_member_id=bernd,
                     split_member_ids=[]).status_code == 400
        assert _book(client, trip, h, description="X", amount=5, paid_by_member_id=bernd,
                     split_member_ids=[999999]).status_code == 400
        assert _book(client, trip, h, kind="transfer", description="X", amount=5, paid_by_member_id=bernd,
                     to_member_id=bernd).status_code == 400
        assert _book(client, trip, h, description="   ", amount=5, paid_by_member_id=bernd).status_code == 422

    def test_participant_with_bookings_cannot_be_removed(self, client, trip, crew):
        ids = _join_all(client, trip, crew)
        _book(client, trip, crew["u_bernd"], description="Bus", amount=30, paid_by_member_id=crew["bernd"].id)
        r = client.put(_url(trip, "/participants"), json={"member_ids": [crew["anna"].id]},
                       headers=_headers(crew["u_anna"]))
        assert r.status_code == 400
        # Everyone is in the implicit "all participants" split, but only explicit references block removal.
        r = client.put(_url(trip, "/participants"), json={"member_ids": [i for i in ids if i != crew["carla"].id]},
                       headers=_headers(crew["u_anna"]))
        assert r.status_code == 200
        bal = {b["id"]: b["balance"] for b in r.json()["balances"]}
        assert bal == {crew["anna"].id: -15, crew["bernd"].id: 15}

    def test_delete_rules(self, client, trip, crew):
        _join_all(client, trip, crew)
        r = _book(client, trip, crew["u_bernd"], description="Bus", amount=30, paid_by_member_id=crew["bernd"].id)
        eid = r.json()["expenses"][0]["id"]
        assert r.json()["expenses"][0]["can_delete"] is True
        assert client.delete(_url(trip, f"/expenses/{eid}"), headers=_headers(crew["u_carla"])).status_code == 403
        r = client.delete(_url(trip, f"/expenses/{eid}"), headers=_headers(crew["u_anna"]))
        assert r.status_code == 200
        assert r.json()["expenses"] == [] and r.json()["total"] == 0
        assert client.delete(_url(trip, f"/expenses/{eid}"), headers=_headers(crew["u_anna"])).status_code == 404

    def test_club_isolation(self, client, trip, crew, db):
        other = Club(name="Other", slug="other-trip-club")
        db.add(other)
        db.commit()
        try:
            u = User(email="x@other.de", name="X", hashed_password=get_password_hash("x"),
                     role=UserRole.admin, club_id=other.id, is_active=True)
            db.add(u)
            db.commit()
            assert client.get(_url(trip), headers=_headers(u)).status_code == 404
        finally:
            db.query(User).filter(User.club_id == other.id).delete(synchronize_session=False)
            db.delete(other)
            db.commit()

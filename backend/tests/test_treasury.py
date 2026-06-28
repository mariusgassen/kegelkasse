"""Tests for treasury endpoints — member balances, payments, expenses, payment requests."""
import time
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings
from models.user import User, UserRole
from models.evening import RegularMember, Evening, EveningPlayer
from models.payment import MemberPayment, ClubExpense, PaymentRequest
from models.penalty import PenaltyLog, PenaltyMode


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db, club):
    u = User(
        email="treasuryadmin@test.de",
        name="Treasury Admin",
        username="treasuryadmin",
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
    m = RegularMember(club_id=club.id, name="Max Mustermann", nickname="Max")
    db.add(m)
    db.commit()
    db.refresh(m)
    yield m


@pytest.fixture()
def member_user(db, club, regular_member):
    """A club member linked to a regular_member (required for PaymentRequests)."""
    u = User(
        email="member_linked@test.de",
        name="Linked Member",
        username="linkedmember",
        hashed_password=get_password_hash("pass"),
        role=UserRole.member,
        club_id=club.id,
        is_active=True,
        regular_member_id=regular_member.id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def member_headers(member_user):
    token = create_access_token({"sub": str(member_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def cleanup(db, club):
    yield
    evening_ids = [e.id for e in db.query(Evening).filter(Evening.club_id == club.id).all()]
    if evening_ids:
        db.query(PenaltyLog).filter(PenaltyLog.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(Evening).filter(Evening.id.in_(evening_ids)).delete(synchronize_session=False)
    db.query(PaymentRequest).filter(PaymentRequest.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.query(User).filter(User.email == "member_linked@test.de").delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


# ---------------------------------------------------------------------------
# GET /api/v1/club/member-balances
# ---------------------------------------------------------------------------

class TestMemberBalances:
    def test_returns_empty_list_when_no_members(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/club/member-balances", headers=auth_headers)
        assert resp.status_code == 200
        # user fixture has no regular_member linked — only non-guest regular members appear
        assert isinstance(resp.json(), list)

    def test_returns_member_with_zero_balance(self, client: TestClient, regular_member, user, auth_headers):
        resp = client.get("/api/v1/club/member-balances", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        member_data = next((m for m in data if m["regular_member_id"] == regular_member.id), None)
        assert member_data is not None
        assert member_data["balance"] == 0.0
        assert member_data["penalty_total"] == 0.0
        assert member_data["payments_total"] == 0.0

    def test_balance_reflects_payment(self, client: TestClient, db, club, regular_member, admin_user, admin_headers, user, auth_headers):
        payment = MemberPayment(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=10.0,
            created_by=admin_user.id,
        )
        db.add(payment)
        db.commit()
        resp = client.get("/api/v1/club/member-balances", headers=auth_headers)
        member_data = next(m for m in resp.json() if m["regular_member_id"] == regular_member.id)
        assert member_data["payments_total"] == 10.0
        assert member_data["balance"] == 10.0

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/club/member-balances")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/club/member-payments — record payment (admin only)
# ---------------------------------------------------------------------------

class TestCreateMemberPayment:
    def test_admin_can_record_payment(self, client: TestClient, db, regular_member, admin_headers):
        resp = client.post("/api/v1/club/member-payments", json={
            "regular_member_id": regular_member.id,
            "amount": 5.50,
            "note": "Barzahlung",
        }, headers=admin_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["amount"] == 5.50
        assert data["note"] == "Barzahlung"

    def test_member_cannot_record_payment(self, client: TestClient, regular_member, auth_headers):
        resp = client.post("/api/v1/club/member-payments", json={
            "regular_member_id": regular_member.id,
            "amount": 5.0,
        }, headers=auth_headers)
        assert resp.status_code == 403

    def test_nonexistent_member_returns_404(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/club/member-payments", json={
            "regular_member_id": 999999,
            "amount": 5.0,
        }, headers=admin_headers)
        assert resp.status_code == 404

    def test_requires_auth(self, client: TestClient, regular_member):
        resp = client.post("/api/v1/club/member-payments", json={
            "regular_member_id": regular_member.id,
            "amount": 5.0,
        })
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/club/member-payments/{mid} — list payments for a member
# ---------------------------------------------------------------------------

class TestListMemberPayments:
    def test_returns_empty_list(self, client: TestClient, regular_member, auth_headers):
        resp = client.get(f"/api/v1/club/member-payments/{regular_member.id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_created_payment(self, client: TestClient, db, club, regular_member, admin_user, admin_headers, auth_headers):
        payment = MemberPayment(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=7.0,
            note="Test",
            created_by=admin_user.id,
        )
        db.add(payment)
        db.commit()
        resp = client.get(f"/api/v1/club/member-payments/{regular_member.id}", headers=auth_headers)
        data = resp.json()
        assert len(data) == 1
        assert data[0]["amount"] == 7.0

    def test_nonexistent_member_returns_404(self, client: TestClient, auth_headers):
        resp = client.get("/api/v1/club/member-payments/999999", headers=auth_headers)
        assert resp.status_code == 404

    def test_requires_auth(self, client: TestClient, regular_member):
        resp = client.get(f"/api/v1/club/member-payments/{regular_member.id}")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/club/member-penalties/{mid}
# ---------------------------------------------------------------------------

class TestMemberPenalties:
    def test_returns_empty_list(self, client: TestClient, regular_member, auth_headers):
        resp = client.get(f"/api/v1/club/member-penalties/{regular_member.id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_player_absence_and_excludes_deleted(
        self, client: TestClient, db, club, regular_member, admin_user, auth_headers,
    ):
        evening = Evening(club_id=club.id, date=datetime(2024, 3, 1, tzinfo=timezone.utc))
        db.add(evening)
        db.commit()
        db.refresh(evening)
        ep = EveningPlayer(evening_id=evening.id, regular_member_id=regular_member.id, name=regular_member.name)
        db.add(ep)
        db.commit()
        db.refresh(ep)

        euro_log = PenaltyLog(
            evening_id=evening.id, player_id=ep.id, player_name=regular_member.name,
            penalty_type_name="Verspätet", icon="⏰", amount=2.0, mode=PenaltyMode.euro,
            created_by=admin_user.id, client_timestamp=time.time(),
        )
        count_log = PenaltyLog(
            evening_id=evening.id, player_id=ep.id, player_name=regular_member.name,
            penalty_type_name="Null", icon="🎳", amount=3, mode=PenaltyMode.count, unit_amount=0.5,
            created_by=admin_user.id, client_timestamp=time.time(),
        )
        absence_log = PenaltyLog(
            evening_id=evening.id, player_id=None, regular_member_id=regular_member.id,
            player_name=regular_member.name, penalty_type_name="Abwesenheit", icon="🚫",
            amount=5.0, mode=PenaltyMode.euro, created_by=admin_user.id, client_timestamp=time.time(),
        )
        deleted_log = PenaltyLog(
            evening_id=evening.id, player_id=ep.id, player_name=regular_member.name,
            penalty_type_name="Gelöscht", amount=99.0, mode=PenaltyMode.euro,
            is_deleted=True, created_by=admin_user.id, client_timestamp=time.time(),
        )
        db.add_all([euro_log, count_log, absence_log, deleted_log])
        db.commit()

        resp = client.get(f"/api/v1/club/member-penalties/{regular_member.id}", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 3
        assert [row["amount"] for row in data] == [2.0, 1.5, 5.0]
        assert [row["is_absence"] for row in data] == [False, False, True]
        assert data[0]["evening_id"] == evening.id
        assert data[0]["evening_date"] == evening.date.isoformat()
        assert data[2]["penalty_type_name"] == "Abwesenheit"

    def test_nonexistent_member_returns_404(self, client: TestClient, auth_headers):
        resp = client.get("/api/v1/club/member-penalties/999999", headers=auth_headers)
        assert resp.status_code == 404

    def test_requires_auth(self, client: TestClient, regular_member):
        resp = client.get(f"/api/v1/club/member-penalties/{regular_member.id}")
        assert resp.status_code == 401

    def test_member_from_other_club_returns_404(self, client: TestClient, db, auth_headers):
        other_club = Club(name="Other Club", slug="other-club-penalties")
        db.add(other_club)
        db.commit()
        db.refresh(other_club)
        other_member = RegularMember(club_id=other_club.id, name="Stranger", nickname="Stranger")
        db.add(other_member)
        db.commit()
        db.refresh(other_member)

        resp = client.get(f"/api/v1/club/member-penalties/{other_member.id}", headers=auth_headers)
        assert resp.status_code == 404

        db.query(RegularMember).filter(RegularMember.id == other_member.id).delete(synchronize_session=False)
        db.query(Club).filter(Club.id == other_club.id).delete(synchronize_session=False)
        db.commit()


# ---------------------------------------------------------------------------
# GET /api/v1/club/treasury-debt-timeline
# ---------------------------------------------------------------------------

class TestTreasuryDebtTimeline:
    def test_returns_empty_list_when_no_members(self, client: TestClient, auth_headers):
        resp = client.get("/api/v1/club/treasury-debt-timeline", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_member_payment_and_penalty_produce_checkpoints(
        self, client: TestClient, db, club, regular_member, admin_user, auth_headers,
    ):
        evening = Evening(club_id=club.id, date=datetime(2024, 5, 1, tzinfo=timezone.utc))
        db.add(evening)
        db.commit()
        db.refresh(evening)
        ep = EveningPlayer(evening_id=evening.id, regular_member_id=regular_member.id, name=regular_member.name)
        db.add(ep)
        db.commit()
        db.refresh(ep)

        t0 = datetime(2024, 5, 1, 10, 0, tzinfo=timezone.utc)
        t1 = datetime(2024, 5, 2, 10, 0, tzinfo=timezone.utc)
        t2 = datetime(2024, 5, 3, 10, 0, tzinfo=timezone.utc)

        penalty = PenaltyLog(
            evening_id=evening.id, player_id=ep.id, player_name=regular_member.name,
            penalty_type_name="Verspätet", icon="⏰", amount=10.0, mode=PenaltyMode.euro,
            created_by=admin_user.id, client_timestamp=time.time(), created_at=t0,
        )
        deleted_penalty = PenaltyLog(
            evening_id=evening.id, player_id=ep.id, player_name=regular_member.name,
            penalty_type_name="Gelöscht", amount=99.0, mode=PenaltyMode.euro,
            is_deleted=True, created_by=admin_user.id, client_timestamp=time.time(), created_at=t1,
        )
        db.add_all([penalty, deleted_penalty])
        db.commit()

        payment = MemberPayment(
            club_id=club.id, regular_member_id=regular_member.id, amount=4.0,
            created_by=admin_user.id, created_at=t2,
        )
        db.add(payment)
        db.commit()

        resp = client.get("/api/v1/club/treasury-debt-timeline", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert [row["total_debt"] for row in data] == [10.0, 6.0]
        assert data[0]["ts"] < data[1]["ts"]

    def test_guest_penalty_capped_per_evening(
        self, client: TestClient, db, club, admin_user, auth_headers,
    ):
        db.add(ClubSettings(club_id=club.id, extra={"guest_penalty_cap": 5.0}))
        db.commit()

        guest = RegularMember(club_id=club.id, name="Guest One", nickname="Guesty", is_guest=True)
        db.add(guest)
        db.commit()
        db.refresh(guest)

        evening = Evening(club_id=club.id, date=datetime(2024, 6, 1, tzinfo=timezone.utc))
        db.add(evening)
        db.commit()
        db.refresh(evening)
        ep = EveningPlayer(evening_id=evening.id, regular_member_id=guest.id, name=guest.name)
        db.add(ep)
        db.commit()
        db.refresh(ep)

        t0 = datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc)
        t1 = datetime(2024, 6, 1, 11, 0, tzinfo=timezone.utc)
        p1 = PenaltyLog(
            evening_id=evening.id, player_id=ep.id, player_name=guest.name,
            penalty_type_name="Null", icon="🎳", amount=3.0, mode=PenaltyMode.euro,
            created_by=admin_user.id, client_timestamp=time.time(), created_at=t0,
        )
        p2 = PenaltyLog(
            evening_id=evening.id, player_id=ep.id, player_name=guest.name,
            penalty_type_name="Bockwurf", icon="🎳", amount=4.0, mode=PenaltyMode.euro,
            created_by=admin_user.id, client_timestamp=time.time(), created_at=t1,
        )
        db.add_all([p1, p2])
        db.commit()

        resp = client.get("/api/v1/club/treasury-debt-timeline", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        # Raw sum would be 7.0 — capped at the club's guest_penalty_cap of 5.0.
        assert data[-1]["total_debt"] == 5.0

    def test_requires_auth(self, client: TestClient, regular_member):
        resp = client.get("/api/v1/club/treasury-debt-timeline")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/club/member-payments/{pid}
# ---------------------------------------------------------------------------

class TestDeleteMemberPayment:
    def test_admin_can_delete_payment(self, client: TestClient, db, club, regular_member, admin_user, admin_headers):
        payment = MemberPayment(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=3.0,
            created_by=admin_user.id,
        )
        db.add(payment)
        db.commit()
        resp = client.delete(f"/api/v1/club/member-payments/{payment.id}", headers=admin_headers)
        assert resp.status_code == 204
        assert db.query(MemberPayment).filter(MemberPayment.id == payment.id).first() is None

    def test_member_cannot_delete_payment(self, client: TestClient, db, club, regular_member, admin_user, auth_headers):
        payment = MemberPayment(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=3.0,
            created_by=admin_user.id,
        )
        db.add(payment)
        db.commit()
        resp = client.delete(f"/api/v1/club/member-payments/{payment.id}", headers=auth_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/v1/club/expenses
# ---------------------------------------------------------------------------

class TestListExpenses:
    def test_empty_list(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/club/expenses", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_expense(self, client: TestClient, db, club, admin_user, auth_headers):
        expense = ClubExpense(
            club_id=club.id,
            amount=50.0,
            description="Bahnmiete",
            created_by=admin_user.id,
        )
        db.add(expense)
        db.commit()
        resp = client.get("/api/v1/club/expenses", headers=auth_headers)
        data = resp.json()
        assert len(data) == 1
        assert data[0]["amount"] == 50.0
        assert data[0]["description"] == "Bahnmiete"

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/club/expenses")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/club/expenses
# ---------------------------------------------------------------------------

class TestCreateExpense:
    def test_admin_can_create_expense(self, client: TestClient, admin_headers):
        resp = client.post("/api/v1/club/expenses", json={
            "amount": 120.0,
            "description": "Vereinsausflug",
        }, headers=admin_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["amount"] == 120.0
        assert data["description"] == "Vereinsausflug"

    def test_member_cannot_create_expense(self, client: TestClient, auth_headers):
        resp = client.post("/api/v1/club/expenses", json={
            "amount": 10.0,
            "description": "Test",
        }, headers=auth_headers)
        assert resp.status_code == 403

    def test_requires_auth(self, client: TestClient):
        resp = client.post("/api/v1/club/expenses", json={"amount": 10.0, "description": "X"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/v1/club/expenses/{eid}
# ---------------------------------------------------------------------------

class TestDeleteExpense:
    def test_admin_can_delete_expense(self, client: TestClient, db, club, admin_user, admin_headers):
        expense = ClubExpense(
            club_id=club.id,
            amount=30.0,
            description="To Delete",
            created_by=admin_user.id,
        )
        db.add(expense)
        db.commit()
        resp = client.delete(f"/api/v1/club/expenses/{expense.id}", headers=admin_headers)
        assert resp.status_code == 204
        assert db.query(ClubExpense).filter(ClubExpense.id == expense.id).first() is None

    def test_member_cannot_delete_expense(self, client: TestClient, db, club, admin_user, auth_headers):
        expense = ClubExpense(
            club_id=club.id,
            amount=30.0,
            description="Protected",
            created_by=admin_user.id,
        )
        db.add(expense)
        db.commit()
        resp = client.delete(f"/api/v1/club/expenses/{expense.id}", headers=auth_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/v1/club/my-balance
# ---------------------------------------------------------------------------

class TestMyBalance:
    def test_returns_balance_structure(self, client: TestClient, user, auth_headers):
        resp = client.get("/api/v1/club/my-balance", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "penalty_total" in data
        assert "payments_total" in data
        assert "balance" in data

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/club/my-balance")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PaymentRequest flow
# ---------------------------------------------------------------------------

class TestPaymentRequestCreate:
    def test_member_can_create_request(self, client: TestClient, member_headers, regular_member):
        resp = client.post("/api/v1/club/payment-requests", json={
            "amount": 12.50,
            "note": "PayPal Überweisung",
        }, headers=member_headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["amount"] == 12.50
        assert data["note"] == "PayPal Überweisung"
        assert data["status"] == "pending"

    def test_member_without_roster_gets_400(self, client: TestClient, auth_headers):
        """User fixture has no regular_member_id — creating a request must fail."""
        resp = client.post("/api/v1/club/payment-requests", json={"amount": 5.0}, headers=auth_headers)
        assert resp.status_code == 400

    def test_zero_amount_gets_400(self, client: TestClient, member_headers):
        resp = client.post("/api/v1/club/payment-requests", json={"amount": 0}, headers=member_headers)
        assert resp.status_code == 400

    def test_requires_auth(self, client: TestClient):
        resp = client.post("/api/v1/club/payment-requests", json={"amount": 5.0})
        assert resp.status_code == 401


class TestPaymentRequestList:
    def test_admin_can_list_pending_requests(self, client: TestClient, db, club, regular_member, admin_headers):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=8.0,
        )
        db.add(req)
        db.commit()
        resp = client.get("/api/v1/club/payment-requests", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert any(r["id"] == req.id for r in data)

    def test_member_cannot_list_all_requests(self, client: TestClient, auth_headers):
        resp = client.get("/api/v1/club/payment-requests", headers=auth_headers)
        assert resp.status_code == 403

    def test_member_can_list_own_requests(self, client: TestClient, db, club, regular_member, member_headers):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=5.0,
        )
        db.add(req)
        db.commit()
        resp = client.get("/api/v1/club/payment-requests/my", headers=member_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert any(r["id"] == req.id for r in data)


class TestPaymentRequestConfirm:
    def test_admin_can_confirm_request(self, client: TestClient, db, club, regular_member, admin_headers):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=20.0,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/confirm", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "confirmed"
        # A MemberPayment should have been created
        payment = db.query(MemberPayment).filter(
            MemberPayment.regular_member_id == regular_member.id,
            MemberPayment.amount == 20.0,
        ).first()
        assert payment is not None

    def test_confirming_nonexistent_request_returns_404(self, client: TestClient, admin_headers):
        resp = client.patch("/api/v1/club/payment-requests/999999/confirm", headers=admin_headers)
        assert resp.status_code == 404

    def test_confirming_already_resolved_returns_400(self, client: TestClient, db, club, regular_member, admin_headers):
        from models.payment import PaymentRequestStatus
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=10.0,
            status=PaymentRequestStatus.confirmed,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/confirm", headers=admin_headers)
        assert resp.status_code == 400

    def test_member_cannot_confirm_request(self, client: TestClient, db, club, regular_member, auth_headers):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=5.0,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/confirm", headers=auth_headers)
        assert resp.status_code == 403


class TestPaymentRequestReject:
    def test_admin_can_reject_request(self, client: TestClient, db, club, regular_member, admin_headers):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=15.0,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/reject", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "rejected"
        # No MemberPayment should have been created
        payment = db.query(MemberPayment).filter(
            MemberPayment.regular_member_id == regular_member.id,
            MemberPayment.amount == 15.0,
        ).first()
        assert payment is None

    def test_rejecting_nonexistent_request_returns_404(self, client: TestClient, admin_headers):
        resp = client.patch("/api/v1/club/payment-requests/999999/reject", headers=admin_headers)
        assert resp.status_code == 404

    def test_member_cannot_reject_request(self, client: TestClient, db, club, regular_member, auth_headers):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=5.0,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/reject", headers=auth_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/v1/club/guest-cost-transfer
# ---------------------------------------------------------------------------

class TestGuestCostTransfer:
    @pytest.fixture()
    def guest(self, db, club):
        g = RegularMember(club_id=club.id, name="Gast Hans", nickname="Hansi", is_guest=True)
        db.add(g)
        db.commit()
        db.refresh(g)
        return g

    def test_admin_can_transfer(self, client: TestClient, db, club, guest, regular_member, admin_headers):
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            headers=admin_headers,
            json={"guest_id": guest.id, "target_member_id": regular_member.id,
                  "amount": 12.50, "note": "Bier-Runde"},
        )
        assert resp.status_code == 201
        body = resp.json()
        guest_p = db.query(MemberPayment).filter(MemberPayment.id == body["guest_payment_id"]).one()
        target_p = db.query(MemberPayment).filter(MemberPayment.id == body["target_payment_id"]).one()
        assert guest_p.regular_member_id == guest.id
        assert guest_p.amount == 12.50
        assert "Max" in (guest_p.note or "")
        assert "Bier-Runde" in (guest_p.note or "")
        assert target_p.regular_member_id == regular_member.id
        assert target_p.amount == -12.50
        assert "Hansi" in (target_p.note or "")

    def test_member_cannot_transfer(self, client: TestClient, guest, regular_member, auth_headers):
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            headers=auth_headers,
            json={"guest_id": guest.id, "target_member_id": regular_member.id, "amount": 5.0},
        )
        assert resp.status_code == 403

    def test_requires_auth(self, client: TestClient, guest, regular_member):
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            json={"guest_id": guest.id, "target_member_id": regular_member.id, "amount": 5.0},
        )
        assert resp.status_code == 401

    def test_missing_guest_returns_404(self, client: TestClient, regular_member, admin_headers):
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            headers=admin_headers,
            json={"guest_id": 999999, "target_member_id": regular_member.id, "amount": 5.0},
        )
        assert resp.status_code == 404

    def test_missing_target_returns_404(self, client: TestClient, guest, admin_headers):
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            headers=admin_headers,
            json={"guest_id": guest.id, "target_member_id": 999999, "amount": 5.0},
        )
        assert resp.status_code == 404

    def test_source_must_be_guest(self, client: TestClient, db, club, regular_member, admin_headers):
        other = RegularMember(club_id=club.id, name="Andere", is_guest=False)
        db.add(other)
        db.commit()
        db.refresh(other)
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            headers=admin_headers,
            json={"guest_id": other.id, "target_member_id": regular_member.id, "amount": 5.0},
        )
        assert resp.status_code == 400

    def test_target_must_not_be_guest(self, client: TestClient, db, club, guest, admin_headers):
        other_guest = RegularMember(club_id=club.id, name="Gast2", is_guest=True)
        db.add(other_guest)
        db.commit()
        db.refresh(other_guest)
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            headers=admin_headers,
            json={"guest_id": guest.id, "target_member_id": other_guest.id, "amount": 5.0},
        )
        assert resp.status_code == 400

    def test_amount_must_be_positive(self, client: TestClient, guest, regular_member, admin_headers):
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            headers=admin_headers,
            json={"guest_id": guest.id, "target_member_id": regular_member.id, "amount": 0},
        )
        assert resp.status_code == 400

    def test_guest_and_target_must_differ(self, client: TestClient, guest, admin_headers):
        resp = client.post(
            "/api/v1/club/guest-cost-transfer",
            headers=admin_headers,
            json={"guest_id": guest.id, "target_member_id": guest.id, "amount": 5.0},
        )
        assert resp.status_code == 400

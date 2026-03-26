"""Tests for treasury endpoints — member balances, payments, expenses, payment requests."""
import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.user import User, UserRole
from models.evening import RegularMember
from models.payment import MemberPayment, ClubExpense, PaymentRequest


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
    db.query(PaymentRequest).filter(PaymentRequest.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club.id).delete(synchronize_session=False)
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

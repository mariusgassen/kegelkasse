"""Tests for treasury endpoints — member balances, payments, expenses."""
import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.user import User, UserRole
from models.evening import RegularMember
from models.payment import MemberPayment, ClubExpense


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


@pytest.fixture(autouse=True)
def cleanup(db, club):
    yield
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club.id).delete(synchronize_session=False)
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

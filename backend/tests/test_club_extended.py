"""
Extended tests for app/api/v1/club.py — covers routes not tested in test_club.py.
"""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings, ClubPin
from models.evening import RegularMember, EveningPlayer, Evening, ClubTeam
from models.game import GameTemplate
from models.payment import MemberPayment, ClubExpense, PaymentRequest, PaymentRequestStatus
from models.penalty import PenaltyType
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.query(ClubPin).filter(ClubPin.club_id == club.id).delete(synchronize_session=False)
    db.query(PaymentRequest).filter(PaymentRequest.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club.id).delete(synchronize_session=False)
    evening_ids = [r[0] for r in db.query(Evening.id).filter(Evening.club_id == club.id).all()]
    if evening_ids:
        from models.penalty import PenaltyLog
        db.query(PenaltyLog).filter(PenaltyLog.evening_id.in_(evening_ids)).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id.in_(evening_ids)).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(GameTemplate).filter(GameTemplate.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubTeam).filter(ClubTeam.club_id == club.id).delete(synchronize_session=False)
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    # user cleanups for users created in this module (admin_user + member users linked to roster)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id, User.email.like("%ext%")).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin_user(db: Session, club: Club) -> User:
    u = User(
        email="admin_ext@test.de",
        name="Admin Ext",
        hashed_password=get_password_hash("x"),
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
def club_settings(db: Session, club: Club) -> ClubSettings:
    s = ClubSettings(club_id=club.id, extra={"ical_token": "existing-token"})
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@pytest.fixture()
def regular_member(db: Session, club: Club) -> RegularMember:
    m = RegularMember(club_id=club.id, name="Roster Member", is_active=True)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


# ---------------------------------------------------------------------------
# POST /club/settings/regenerate-ical-token
# ---------------------------------------------------------------------------

class TestRegenerateIcalToken:
    def test_admin_regenerates_token(self, client: TestClient, admin_headers: dict, club_settings: ClubSettings):
        resp = client.post("/api/v1/club/settings/regenerate-ical-token", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "ical_token" in data
        assert data["ical_token"] != "existing-token"

    def test_member_cannot_regenerate(self, client: TestClient, auth_headers: dict, club_settings: ClubSettings):
        resp = client.post("/api/v1/club/settings/regenerate-ical-token", headers=auth_headers)
        assert resp.status_code == 403

    def test_unauthenticated_fails(self, client: TestClient):
        resp = client.post("/api/v1/club/settings/regenerate-ical-token")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /club/members
# ---------------------------------------------------------------------------

class TestGetMembers:
    def test_lists_active_members(self, client: TestClient, auth_headers: dict, admin_user: User, user: User):
        resp = client.get("/api/v1/club/members", headers=auth_headers)
        assert resp.status_code == 200
        ids = [m["id"] for m in resp.json()]
        assert user.id in ids

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/club/members")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# PATCH /club/members/{id}/role
# ---------------------------------------------------------------------------

class TestUpdateMemberRole:
    def test_admin_updates_role(self, client: TestClient, admin_headers: dict, user: User):
        resp = client.patch(f"/api/v1/club/members/{user.id}/role",
                            headers=admin_headers, params={"role": "admin"})
        assert resp.status_code == 200

    def test_404_if_not_found(self, client: TestClient, admin_headers: dict):
        resp = client.patch("/api/v1/club/members/999999/role",
                            headers=admin_headers, params={"role": "admin"})
        assert resp.status_code == 404

    def test_400_for_invalid_role(self, client: TestClient, admin_headers: dict, user: User):
        resp = client.patch(f"/api/v1/club/members/{user.id}/role",
                            headers=admin_headers, params={"role": "king"})
        assert resp.status_code == 400

    def test_member_cannot_update(self, client: TestClient, auth_headers: dict, user: User):
        resp = client.patch(f"/api/v1/club/members/{user.id}/role",
                            headers=auth_headers, params={"role": "admin"})
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# DELETE /club/members/{id}
# ---------------------------------------------------------------------------

class TestDeactivateMember:
    def test_admin_deactivates_member(self, client: TestClient, admin_headers: dict, user: User):
        resp = client.delete(f"/api/v1/club/members/{user.id}", headers=admin_headers)
        assert resp.status_code == 200

    def test_cannot_deactivate_self(self, client: TestClient, admin_headers: dict, admin_user: User):
        resp = client.delete(f"/api/v1/club/members/{admin_user.id}", headers=admin_headers)
        assert resp.status_code == 400

    def test_cannot_deactivate_superadmin(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        sa = User(
            email="sa_ext@test.de",
            name="Superadmin Ext",
            hashed_password=get_password_hash("x"),
            role=UserRole.superadmin,
            club_id=club.id,
            is_active=True,
        )
        db.add(sa)
        db.commit()
        db.refresh(sa)
        resp = client.delete(f"/api/v1/club/members/{sa.id}", headers=admin_headers)
        assert resp.status_code == 403
        db.delete(sa)
        db.commit()

    def test_404_if_not_found(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/members/999999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /club/members/{id}/reactivate
# ---------------------------------------------------------------------------

class TestReactivateMember:
    def test_admin_reactivates(self, client: TestClient, admin_headers: dict, user: User, db: Session):
        user.is_active = False
        db.commit()
        resp = client.patch(f"/api/v1/club/members/{user.id}/reactivate", headers=admin_headers)
        assert resp.status_code == 200

    def test_404_if_not_found(self, client: TestClient, admin_headers: dict):
        resp = client.patch("/api/v1/club/members/999999/reactivate", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /club/members/{id}/link
# ---------------------------------------------------------------------------

class TestLinkUserToRoster:
    def test_admin_links_user_to_roster(self, client: TestClient, admin_headers: dict, user: User, regular_member: RegularMember):
        resp = client.patch(
            f"/api/v1/club/members/{user.id}/link",
            headers=admin_headers,
            json={"regular_member_id": regular_member.id},
        )
        assert resp.status_code == 200

    def test_link_to_nonexistent_roster_404(self, client: TestClient, admin_headers: dict, user: User):
        resp = client.patch(
            f"/api/v1/club/members/{user.id}/link",
            headers=admin_headers,
            json={"regular_member_id": 999999},
        )
        assert resp.status_code == 404

    def test_404_if_user_not_found(self, client: TestClient, admin_headers: dict):
        resp = client.patch(
            "/api/v1/club/members/999999/link",
            headers=admin_headers,
            json={"regular_member_id": None},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /club/regular-members
# ---------------------------------------------------------------------------

class TestListRegularMembers:
    def test_lists_members(self, client: TestClient, auth_headers: dict, regular_member: RegularMember):
        resp = client.get("/api/v1/club/regular-members", headers=auth_headers)
        assert resp.status_code == 200
        ids = [m["id"] for m in resp.json()]
        assert regular_member.id in ids

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/club/regular-members")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /club/regular-members
# ---------------------------------------------------------------------------

class TestCreateRegularMember:
    def test_member_can_create(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/regular-members", headers=auth_headers,
                           json={"name": "New Player", "nickname": "Newbie", "is_guest": False})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Player"


# ---------------------------------------------------------------------------
# PUT /club/regular-members/{id}
# ---------------------------------------------------------------------------

class TestUpdateRegularMember:
    def test_admin_updates(self, client: TestClient, admin_headers: dict, regular_member: RegularMember):
        resp = client.put(f"/api/v1/club/regular-members/{regular_member.id}", headers=admin_headers,
                          json={"name": "Updated Name"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_404_if_not_found(self, client: TestClient, admin_headers: dict):
        resp = client.put("/api/v1/club/regular-members/999999", headers=admin_headers,
                          json={"name": "X"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /club/regular-members/{id}
# ---------------------------------------------------------------------------

class TestDeleteRegularMember:
    def test_admin_soft_deletes(self, client: TestClient, admin_headers: dict, regular_member: RegularMember):
        resp = client.delete(f"/api/v1/club/regular-members/{regular_member.id}", headers=admin_headers)
        assert resp.status_code == 200

    def test_404_if_not_found(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/regular-members/999999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /club/regular-members/{discard_id}/merge-into/{keep_id}
# ---------------------------------------------------------------------------

class TestMergeRegularMembers:
    def test_merge_two_members(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        m1 = RegularMember(club_id=club.id, name="Discard Me", is_active=True)
        m2 = RegularMember(club_id=club.id, name="Keep Me", is_active=True)
        db.add_all([m1, m2])
        db.commit()
        resp = client.post(f"/api/v1/club/regular-members/{m1.id}/merge-into/{m2.id}",
                           headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["kept_id"] == m2.id

    def test_400_same_id(self, client: TestClient, admin_headers: dict, regular_member: RegularMember):
        resp = client.post(
            f"/api/v1/club/regular-members/{regular_member.id}/merge-into/{regular_member.id}",
            headers=admin_headers,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# POST /club/regular-members/{id}/invite
# ---------------------------------------------------------------------------

class TestCreateMemberInvite:
    def test_admin_creates_invite(self, client: TestClient, admin_headers: dict, regular_member: RegularMember):
        resp = client.post(f"/api/v1/club/regular-members/{regular_member.id}/invite",
                           headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "invite_url" in data

    def test_404_if_not_found(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/regular-members/999999/invite", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Penalty types
# ---------------------------------------------------------------------------

class TestPenaltyTypes:
    def test_list_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/club/penalty-types")
        assert resp.status_code == 401

    def test_list(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/penalty-types", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/penalty-types", headers=admin_headers,
                           json={"name": "Zu spät", "icon": "⏰", "default_amount": 0.5, "sort_order": 1})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Zu spät"

    def test_member_cannot_create(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/penalty-types", headers=auth_headers,
                           json={"name": "X", "icon": "⚠️", "default_amount": 1.0, "sort_order": 0})
        assert resp.status_code == 403

    def test_update(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        pt = PenaltyType(club_id=club.id, name="Old", icon="⚠️", default_amount=0.5)
        db.add(pt)
        db.commit()
        resp = client.put(f"/api/v1/club/penalty-types/{pt.id}", headers=admin_headers,
                          json={"name": "New", "icon": "🔥", "default_amount": 1.0, "sort_order": 2})
        assert resp.status_code == 200
        # Verify update by fetching the list
        db.expire(pt)
        db.refresh(pt)
        assert pt.name == "New"

    def test_update_404(self, client: TestClient, admin_headers: dict):
        resp = client.put("/api/v1/club/penalty-types/999999", headers=admin_headers,
                          json={"name": "X", "icon": "⚠️", "default_amount": 1.0, "sort_order": 0})
        assert resp.status_code == 404

    def test_delete(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        pt = PenaltyType(club_id=club.id, name="DeleteMe", icon="⚠️", default_amount=0.5)
        db.add(pt)
        db.commit()
        resp = client.delete(f"/api/v1/club/penalty-types/{pt.id}", headers=admin_headers)
        assert resp.status_code == 200

    def test_delete_404(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/penalty-types/999999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Game templates
# ---------------------------------------------------------------------------

class TestGameTemplates:
    def test_list(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/game-templates", headers=auth_headers)
        assert resp.status_code == 200

    def test_create(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/game-templates", headers=admin_headers,
                           json={"name": "Eröffnung", "winner_type": "individual", "is_opener": True,
                                 "default_loser_penalty": 1.0, "per_point_penalty": 0.0, "sort_order": 0})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Eröffnung"

    def test_member_cannot_create(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/game-templates", headers=auth_headers,
                           json={"name": "X", "winner_type": "individual", "default_loser_penalty": 0,
                                 "per_point_penalty": 0, "sort_order": 0})
        assert resp.status_code == 403

    def test_update(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        from models.game import WinnerType
        gt = GameTemplate(club_id=club.id, name="Old Template", winner_type=WinnerType.individual,
                          default_loser_penalty=0, per_point_penalty=0, sort_order=0)
        db.add(gt)
        db.commit()
        resp = client.put(f"/api/v1/club/game-templates/{gt.id}", headers=admin_headers,
                          json={"name": "New Template", "winner_type": "individual",
                                "default_loser_penalty": 0, "per_point_penalty": 0, "sort_order": 0})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Template"

    def test_update_404(self, client: TestClient, admin_headers: dict):
        resp = client.put("/api/v1/club/game-templates/999999", headers=admin_headers,
                          json={"name": "X", "winner_type": "individual",
                                "default_loser_penalty": 0, "per_point_penalty": 0, "sort_order": 0})
        assert resp.status_code == 404

    def test_delete(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        from models.game import WinnerType
        gt = GameTemplate(club_id=club.id, name="DeleteMe", winner_type=WinnerType.individual,
                          default_loser_penalty=0, per_point_penalty=0, sort_order=0)
        db.add(gt)
        db.commit()
        resp = client.delete(f"/api/v1/club/game-templates/{gt.id}", headers=admin_headers)
        assert resp.status_code == 200

    def test_delete_404(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/game-templates/999999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Club teams
# ---------------------------------------------------------------------------

class TestClubTeams:
    def test_list(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/teams", headers=auth_headers)
        assert resp.status_code == 200

    def test_create(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/teams", headers=admin_headers,
                           json={"name": "Team A", "sort_order": 0})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Team A"

    def test_member_cannot_create(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/teams", headers=auth_headers, json={"name": "X", "sort_order": 0})
        assert resp.status_code == 403

    def test_update(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        team = ClubTeam(club_id=club.id, name="Old Team")
        db.add(team)
        db.commit()
        resp = client.put(f"/api/v1/club/teams/{team.id}", headers=admin_headers,
                          json={"name": "New Team", "sort_order": 1})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Team"

    def test_update_404(self, client: TestClient, admin_headers: dict):
        resp = client.put("/api/v1/club/teams/999999", headers=admin_headers,
                          json={"name": "X", "sort_order": 0})
        assert resp.status_code == 404

    def test_delete(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        team = ClubTeam(club_id=club.id, name="ToDelete")
        db.add(team)
        db.commit()
        resp = client.delete(f"/api/v1/club/teams/{team.id}", headers=admin_headers)
        assert resp.status_code == 200

    def test_delete_404(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/teams/999999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Member balances
# ---------------------------------------------------------------------------

class TestMemberBalances:
    def test_returns_list(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/member-balances", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/club/member-balances")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Member payments
# ---------------------------------------------------------------------------

class TestMemberPayments:
    def test_list_for_member(self, client: TestClient, admin_headers: dict, regular_member: RegularMember):
        resp = client.get(f"/api/v1/club/member-payments/{regular_member.id}", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_list_404_if_not_found(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/member-payments/999999", headers=auth_headers)
        assert resp.status_code == 404

    def test_create(self, client: TestClient, admin_headers: dict, regular_member: RegularMember):
        resp = client.post("/api/v1/club/member-payments", headers=admin_headers,
                           json={"regular_member_id": regular_member.id, "amount": 5.0, "note": "Cash"})
        assert resp.status_code == 201
        assert resp.json()["amount"] == 5.0

    def test_create_404_if_member_missing(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/member-payments", headers=admin_headers,
                           json={"regular_member_id": 999999, "amount": 5.0})
        assert resp.status_code == 404

    def test_member_cannot_create_payment(self, client: TestClient, auth_headers: dict, regular_member: RegularMember):
        resp = client.post("/api/v1/club/member-payments", headers=auth_headers,
                           json={"regular_member_id": regular_member.id, "amount": 5.0})
        assert resp.status_code == 403

    def test_delete(self, client: TestClient, admin_headers: dict, db: Session, club: Club, regular_member: RegularMember, admin_user: User):
        p = MemberPayment(club_id=club.id, regular_member_id=regular_member.id, amount=3.0, created_by=admin_user.id)
        db.add(p)
        db.commit()
        resp = client.delete(f"/api/v1/club/member-payments/{p.id}", headers=admin_headers)
        assert resp.status_code == 204

    def test_delete_404(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/member-payments/999999", headers=admin_headers)
        assert resp.status_code == 404

    def test_list_all(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/member-payments", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# Guest balances
# ---------------------------------------------------------------------------

class TestGuestBalances:
    def test_returns_list(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/guest-balances", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# Club expenses
# ---------------------------------------------------------------------------

class TestClubExpenses:
    def test_list(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/expenses", headers=auth_headers)
        assert resp.status_code == 200

    def test_create(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/expenses", headers=admin_headers,
                           json={"amount": 20.0, "description": "Bandmiete"})
        assert resp.status_code == 201
        assert resp.json()["description"] == "Bandmiete"

    def test_create_400_for_zero_amount(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/expenses", headers=admin_headers,
                           json={"amount": 0, "description": "Zero"})
        assert resp.status_code == 400

    def test_member_cannot_create(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/expenses", headers=auth_headers,
                           json={"amount": 10.0, "description": "X"})
        assert resp.status_code == 403

    def test_delete(self, client: TestClient, admin_headers: dict, db: Session, club: Club, admin_user: User):
        exp = ClubExpense(club_id=club.id, amount=10.0, description="Del", created_by=admin_user.id)
        db.add(exp)
        db.commit()
        resp = client.delete(f"/api/v1/club/expenses/{exp.id}", headers=admin_headers)
        assert resp.status_code == 204

    def test_delete_404(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/expenses/999999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# My balance
# ---------------------------------------------------------------------------

class TestMyBalance:
    def test_no_roster_returns_null(self, client: TestClient, auth_headers: dict, user: User):
        # user fixture has no regular_member_id by default
        resp = client.get("/api/v1/club/my-balance", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["balance"] is None

    def test_with_roster_returns_balance(self, client: TestClient, auth_headers: dict, user: User,
                                         regular_member: RegularMember, db: Session):
        user.regular_member_id = regular_member.id
        db.commit()
        resp = client.get("/api/v1/club/my-balance", headers=auth_headers)
        assert resp.status_code == 200
        assert "balance" in resp.json()
        user.regular_member_id = None
        db.commit()


# ---------------------------------------------------------------------------
# Payment requests
# ---------------------------------------------------------------------------

class TestPaymentRequests:
    def test_admin_lists_pending(self, client: TestClient, admin_headers: dict):
        resp = client.get("/api/v1/club/payment-requests", headers=admin_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_member_cannot_list_all(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/payment-requests", headers=auth_headers)
        assert resp.status_code == 403

    def test_list_my_requests(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/payment-requests/my", headers=auth_headers)
        assert resp.status_code == 200

    def test_create_request_400_if_no_roster(self, client: TestClient, auth_headers: dict, user: User):
        resp = client.post("/api/v1/club/payment-requests", headers=auth_headers,
                           json={"amount": 5.0})
        assert resp.status_code == 400

    def test_create_request_with_roster(self, client: TestClient, auth_headers: dict, user: User,
                                        regular_member: RegularMember, db: Session):
        user.regular_member_id = regular_member.id
        db.commit()
        resp = client.post("/api/v1/club/payment-requests", headers=auth_headers,
                           json={"amount": 5.0, "note": "PayPal sent"})
        assert resp.status_code == 201
        assert resp.json()["amount"] == 5.0
        user.regular_member_id = None
        db.commit()

    def test_confirm_request(self, client: TestClient, admin_headers: dict, db: Session, club: Club,
                              regular_member: RegularMember, admin_user: User):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=10.0,
            status=PaymentRequestStatus.pending,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/confirm", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "confirmed"

    def test_confirm_request_404(self, client: TestClient, admin_headers: dict):
        resp = client.patch("/api/v1/club/payment-requests/999999/confirm", headers=admin_headers)
        assert resp.status_code == 404

    def test_confirm_request_400_already_processed(self, client: TestClient, admin_headers: dict,
                                                    db: Session, club: Club, regular_member: RegularMember,
                                                    admin_user: User):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=5.0,
            status=PaymentRequestStatus.confirmed,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/confirm", headers=admin_headers)
        assert resp.status_code == 400

    def test_reject_request(self, client: TestClient, admin_headers: dict, db: Session, club: Club,
                             regular_member: RegularMember, admin_user: User):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=8.0,
            status=PaymentRequestStatus.pending,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/reject", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "rejected"

    def test_reject_request_404(self, client: TestClient, admin_headers: dict):
        resp = client.patch("/api/v1/club/payment-requests/999999/reject", headers=admin_headers)
        assert resp.status_code == 404

    def test_reject_request_400_already_processed(self, client: TestClient, admin_headers: dict,
                                                   db: Session, club: Club, regular_member: RegularMember,
                                                   admin_user: User):
        req = PaymentRequest(
            club_id=club.id,
            regular_member_id=regular_member.id,
            amount=7.0,
            status=PaymentRequestStatus.rejected,
        )
        db.add(req)
        db.commit()
        resp = client.patch(f"/api/v1/club/payment-requests/{req.id}/reject", headers=admin_headers)
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Reminder settings
# ---------------------------------------------------------------------------

class TestReminderSettings:
    def test_get_settings(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/reminder-settings", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "debt_weekly" in data

    def test_admin_updates_settings(self, client: TestClient, admin_headers: dict):
        resp = client.patch("/api/v1/club/reminder-settings", headers=admin_headers,
                            json={"debt_weekly": {"enabled": True, "weekday": 2, "min_debt": 10.0}})
        assert resp.status_code == 200

    def test_member_cannot_update(self, client: TestClient, auth_headers: dict):
        resp = client.patch("/api/v1/club/reminder-settings", headers=auth_headers,
                            json={"debt_weekly": {"enabled": True}})
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Broadcast push
# ---------------------------------------------------------------------------

class TestBroadcastPush:
    def test_admin_can_broadcast(self, client: TestClient, admin_headers: dict):
        from unittest.mock import patch
        with patch("core.push.push_to_club"):
            resp = client.post("/api/v1/club/broadcast-push", headers=admin_headers,
                               json={"title": "Hello", "body": "World", "url": "/"})
        assert resp.status_code == 200

    def test_member_cannot_broadcast(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/broadcast-push", headers=auth_headers,
                           json={"title": "X", "body": "Y", "url": "/"})
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Remind debtors
# ---------------------------------------------------------------------------

class TestRemindDebtors:
    def test_admin_can_remind(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/remind-debtors", headers=admin_headers)
        assert resp.status_code == 200
        assert "reminded_count" in resp.json()

    def test_member_cannot_remind(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/remind-debtors", headers=auth_headers)
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Club pins
# ---------------------------------------------------------------------------

class TestClubPins:
    def test_list(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/pins", headers=auth_headers)
        assert resp.status_code == 200

    def test_create(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/pins", headers=admin_headers,
                           json={"name": "Gold Pin", "icon": "🥇"})
        assert resp.status_code == 201
        assert resp.json()["name"] == "Gold Pin"

    def test_member_cannot_create(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/pins", headers=auth_headers, json={"name": "X"})
        assert resp.status_code == 403

    def test_update_name(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        pin = ClubPin(club_id=club.id, name="Old Pin", icon="📌")
        db.add(pin)
        db.commit()
        resp = client.put(f"/api/v1/club/pins/{pin.id}", headers=admin_headers,
                          json={"name": "New Pin"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Pin"

    def test_update_assign_holder(self, client: TestClient, admin_headers: dict,
                                  db: Session, club: Club, regular_member: RegularMember):
        pin = ClubPin(club_id=club.id, name="Pin with holder", icon="📌")
        db.add(pin)
        db.commit()
        resp = client.put(f"/api/v1/club/pins/{pin.id}", headers=admin_headers,
                          json={"holder_regular_member_id": regular_member.id})
        assert resp.status_code == 200
        assert resp.json()["holder_regular_member_id"] == regular_member.id

    def test_update_clear_holder(self, client: TestClient, admin_headers: dict,
                                 db: Session, club: Club, regular_member: RegularMember):
        pin = ClubPin(
            club_id=club.id, name="Pin clear test", icon="📌",
            holder_regular_member_id=regular_member.id,
            holder_name=regular_member.name,
        )
        db.add(pin)
        db.commit()
        resp = client.put(f"/api/v1/club/pins/{pin.id}", headers=admin_headers,
                          json={"holder_regular_member_id": None})
        assert resp.status_code == 200
        assert resp.json()["holder_regular_member_id"] is None

    def test_update_404(self, client: TestClient, admin_headers: dict):
        resp = client.put("/api/v1/club/pins/999999", headers=admin_headers, json={"name": "X"})
        assert resp.status_code == 404

    def test_delete(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        pin = ClubPin(club_id=club.id, name="DeletePin", icon="📌")
        db.add(pin)
        db.commit()
        resp = client.delete(f"/api/v1/club/pins/{pin.id}", headers=admin_headers)
        assert resp.status_code == 204

    def test_delete_404(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/pins/999999", headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Committee toggle
# ---------------------------------------------------------------------------

class TestCommitteeToggle:
    def test_admin_sets_committee_flag(self, client: TestClient, admin_headers: dict,
                                       regular_member: RegularMember):
        resp = client.patch(f"/api/v1/club/members/{regular_member.id}/committee",
                            headers=admin_headers,
                            json={"is_committee": True})
        assert resp.status_code == 200
        assert resp.json()["is_committee"] is True

    def test_admin_clears_committee_flag(self, client: TestClient, admin_headers: dict,
                                         regular_member: RegularMember):
        resp = client.patch(f"/api/v1/club/members/{regular_member.id}/committee",
                            headers=admin_headers,
                            json={"is_committee": False})
        assert resp.status_code == 200
        assert resp.json()["is_committee"] is False

    def test_404_if_member_not_found(self, client: TestClient, admin_headers: dict):
        resp = client.patch("/api/v1/club/members/999999/committee",
                            headers=admin_headers,
                            json={"is_committee": True})
        assert resp.status_code == 404

    def test_member_cannot_toggle(self, client: TestClient, auth_headers: dict,
                                   regular_member: RegularMember):
        resp = client.patch(f"/api/v1/club/members/{regular_member.id}/committee",
                            headers=auth_headers,
                            json={"is_committee": True})
        assert resp.status_code == 403

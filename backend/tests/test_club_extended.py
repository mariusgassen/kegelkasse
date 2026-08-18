"""
Extended tests for app/api/v1/club.py — covers routes not tested in test_club.py.
"""

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

    def test_returns_username_field(self, client: TestClient, db: Session, auth_headers: dict, user: User):
        user.username = "clubmember"
        db.commit()
        resp = client.get("/api/v1/club/members", headers=auth_headers)
        assert resp.status_code == 200
        member = next(m for m in resp.json() if m["id"] == user.id)
        assert "username" in member
        assert member["username"] == "clubmember"

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

    def test_list_is_ordered_by_price_then_name(self, client: TestClient, admin_headers: dict):
        # The old sort_order column was never set by the UI, so the grid came out in insertion
        # order. Price is what a member scans for at the lane; the name breaks ties.
        for name, amount in (("Zebra", 1.0), ("Anton", 1.0), ("Billig", 0.1)):
            client.post("/api/v1/club/penalty-types", headers=admin_headers,
                        json={"name": name, "icon": "⚠️", "default_amount": amount})

        resp = client.get("/api/v1/club/penalty-types", headers=admin_headers)
        assert resp.status_code == 200
        names = [pt["name"] for pt in resp.json() if pt["name"] in ("Zebra", "Anton", "Billig")]
        assert names == ["Billig", "Anton", "Zebra"]

    def test_create_tolerates_legacy_sort_order_field(self, client: TestClient, admin_headers: dict):
        # Bundles and clients from before the column was dropped still send it; an extra field
        # must not 422 a rolling deploy.
        resp = client.post("/api/v1/club/penalty-types", headers=admin_headers,
                           json={"name": "Alt", "icon": "⚠️", "default_amount": 1.0, "sort_order": 7})
        assert resp.status_code == 200
        assert "sort_order" not in resp.json()

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

    def test_create_with_sound_key(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/penalty-types", headers=admin_headers,
                           json={"name": "Null", "icon": "🎳", "default_amount": 1.0, "sort_order": 0,
                                 "sound_key": "buzzer"})
        assert resp.status_code == 200
        assert resp.json()["sound_key"] == "buzzer"

    def test_every_catalog_preset_is_accepted(self, client: TestClient, admin_headers: dict):
        """The allowlist must stay in step with the frontend catalog (lib/soundboard.ts)."""
        from models.penalty import SOUND_PRESET_KEYS

        for key in SOUND_PRESET_KEYS:
            resp = client.post("/api/v1/club/penalty-types", headers=admin_headers,
                               json={"name": f"Test {key}", "icon": "⚠️", "default_amount": 1.0,
                                     "sort_order": 0, "sound_key": key})
            assert resp.status_code == 200, key
            assert resp.json()["sound_key"] == key

    def test_create_unknown_sound_key_is_dropped(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/penalty-types", headers=admin_headers,
                           json={"name": "X", "icon": "⚠️", "default_amount": 1.0, "sort_order": 0,
                                 "sound_key": "not-a-real-preset"})
        assert resp.status_code == 200
        assert resp.json()["sound_key"] is None

    def test_update_sound_key(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        pt = PenaltyType(club_id=club.id, name="Old", icon="⚠️", default_amount=0.5)
        db.add(pt)
        db.commit()
        resp = client.put(f"/api/v1/club/penalty-types/{pt.id}", headers=admin_headers,
                          json={"name": "Old", "icon": "⚠️", "default_amount": 0.5, "sort_order": 0,
                                "sound_key": "cash_register"})
        assert resp.status_code == 200
        assert resp.json()["sound_key"] == "cash_register"
        db.expire(pt)
        db.refresh(pt)
        assert pt.sound_key == "cash_register"

    def test_update_clears_sound_key(self, client: TestClient, admin_headers: dict, db: Session, club: Club):
        pt = PenaltyType(club_id=club.id, name="Old", icon="⚠️", default_amount=0.5, sound_key="bell")
        db.add(pt)
        db.commit()
        resp = client.put(f"/api/v1/club/penalty-types/{pt.id}", headers=admin_headers,
                          json={"name": "Old", "icon": "⚠️", "default_amount": 0.5, "sort_order": 0})
        assert resp.status_code == 200
        assert resp.json()["sound_key"] is None


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


# ---------------------------------------------------------------------------
# DELETE /club/regular-members/{mid} — cascade deactivates linked user
# ---------------------------------------------------------------------------

class TestDeleteRegularMemberCascade:
    def test_deactivates_roster_entry(self, client: TestClient, admin_headers: dict,
                                      regular_member: RegularMember, db: Session):
        resp = client.delete(f"/api/v1/club/regular-members/{regular_member.id}",
                             headers=admin_headers)
        assert resp.status_code == 200
        db.refresh(regular_member)
        # Regular member removal converts to guest (stays active, can still be added to evenings)
        assert regular_member.is_guest is True
        assert regular_member.is_active is True

    def test_clears_pin_holder(self, client: TestClient, admin_headers: dict,
                               regular_member: RegularMember, db: Session, club: Club):
        from datetime import datetime, timezone
        pin = ClubPin(
            club_id=club.id,
            name="Goldnadel",
            holder_regular_member_id=regular_member.id,
            holder_name=regular_member.name,
            assigned_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
        )
        db.add(pin)
        db.commit()
        db.refresh(pin)

        resp = client.delete(f"/api/v1/club/regular-members/{regular_member.id}",
                             headers=admin_headers)
        assert resp.status_code == 200
        db.refresh(pin)
        assert pin.holder_regular_member_id is None
        assert pin.holder_name is None

    def test_also_deactivates_linked_user(self, client: TestClient, admin_headers: dict,
                                           regular_member: RegularMember, db: Session, club: Club):
        linked_user = User(
            email="linked_cascade_ext@test.de",
            name="Linked User",
            hashed_password="x",
            role=UserRole.member,
            club_id=club.id,
            is_active=True,
            regular_member_id=regular_member.id,
        )
        db.add(linked_user)
        db.commit()
        db.refresh(linked_user)

        resp = client.delete(f"/api/v1/club/regular-members/{regular_member.id}",
                             headers=admin_headers)
        assert resp.status_code == 200
        db.refresh(linked_user)
        assert linked_user.is_active is False

    def test_member_cannot_remove(self, client: TestClient, auth_headers: dict,
                                   regular_member: RegularMember):
        resp = client.delete(f"/api/v1/club/regular-members/{regular_member.id}",
                             headers=auth_headers)
        assert resp.status_code == 403

    def test_404_unknown_member(self, client: TestClient, admin_headers: dict):
        resp = client.delete("/api/v1/club/regular-members/999999", headers=admin_headers)
        assert resp.status_code == 404

    def test_400_guest_cannot_be_deleted(self, client: TestClient, admin_headers: dict,
                                          regular_member: RegularMember, db: Session):
        regular_member.is_guest = True
        db.commit()
        resp = client.delete(f"/api/v1/club/regular-members/{regular_member.id}",
                             headers=admin_headers)
        assert resp.status_code == 400
        db.refresh(regular_member)
        assert regular_member.is_guest is True
        assert regular_member.is_active is True


# ---------------------------------------------------------------------------
# PATCH /club/regular-members/{mid}/reactivate
# ---------------------------------------------------------------------------

class TestReactivateRegularMember:
    def test_reactivates_inactive_member(self, client: TestClient, admin_headers: dict,
                                          regular_member: RegularMember, db: Session):
        regular_member.is_guest = True
        db.commit()

        resp = client.patch(f"/api/v1/club/regular-members/{regular_member.id}/reactivate",
                            headers=admin_headers)
        assert resp.status_code == 200
        db.refresh(regular_member)
        assert regular_member.is_guest is False
        assert regular_member.is_active is True

    def test_also_reactivates_linked_user(self, client: TestClient, admin_headers: dict,
                                           regular_member: RegularMember, db: Session, club: Club):
        linked_user = User(
            email="linked_reactivate_ext@test.de",
            name="Linked Reactivate",
            hashed_password="x",
            role=UserRole.member,
            club_id=club.id,
            is_active=False,
            regular_member_id=regular_member.id,
        )
        db.add(linked_user)
        regular_member.is_guest = True
        db.commit()
        db.refresh(linked_user)

        resp = client.patch(f"/api/v1/club/regular-members/{regular_member.id}/reactivate",
                            headers=admin_headers)
        assert resp.status_code == 200
        db.refresh(linked_user)
        assert linked_user.is_active is True

    def test_member_cannot_reactivate(self, client: TestClient, auth_headers: dict,
                                       regular_member: RegularMember, db: Session):
        regular_member.is_guest = True
        db.commit()
        resp = client.patch(f"/api/v1/club/regular-members/{regular_member.id}/reactivate",
                            headers=auth_headers)
        assert resp.status_code == 403

    def test_404_unknown_member(self, client: TestClient, admin_headers: dict):
        resp = client.patch("/api/v1/club/regular-members/999999/reactivate",
                            headers=admin_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /club/treasury-payout
# ---------------------------------------------------------------------------

class TestTreasuryPayout:
    @pytest.fixture()
    def payout_member(self, db: Session, club: Club) -> RegularMember:
        m = RegularMember(club_id=club.id, name="Payout Member", is_active=True)
        db.add(m)
        db.commit()
        db.refresh(m)
        return m

    def test_creates_negative_payment_entries(self, client: TestClient, admin_headers: dict,
                                               payout_member: RegularMember, db: Session, club: Club):
        resp = client.post("/api/v1/club/treasury-payout", headers=admin_headers, json={
            "payouts": [{"regular_member_id": payout_member.id, "amount": 12.50}],
            "note": "Jahresüberschuss",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["created"] == 1
        payment = db.query(MemberPayment).filter(
            MemberPayment.club_id == club.id,
            MemberPayment.regular_member_id == payout_member.id,
        ).first()
        assert payment is not None
        assert payment.amount == pytest.approx(-12.50)
        assert payment.note == "Jahresüberschuss"

    def test_skips_zero_amount_entries(self, client: TestClient, admin_headers: dict,
                                        payout_member: RegularMember):
        resp = client.post("/api/v1/club/treasury-payout", headers=admin_headers, json={
            "payouts": [{"regular_member_id": payout_member.id, "amount": 0}],
        })
        assert resp.status_code == 400

    def test_multiple_members(self, client: TestClient, admin_headers: dict,
                               payout_member: RegularMember, db: Session, club: Club):
        m2 = RegularMember(club_id=club.id, name="Payout Member 2", is_active=True)
        db.add(m2)
        db.commit()
        db.refresh(m2)

        resp = client.post("/api/v1/club/treasury-payout", headers=admin_headers, json={
            "payouts": [
                {"regular_member_id": payout_member.id, "amount": 10.0},
                {"regular_member_id": m2.id, "amount": 20.0},
            ],
        })
        assert resp.status_code == 201
        assert resp.json()["created"] == 2

    def test_404_for_unknown_member(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/treasury-payout", headers=admin_headers, json={
            "payouts": [{"regular_member_id": 999999, "amount": 10.0}],
        })
        assert resp.status_code == 404

    def test_member_cannot_payout(self, client: TestClient, auth_headers: dict,
                                   payout_member: RegularMember):
        resp = client.post("/api/v1/club/treasury-payout", headers=auth_headers, json={
            "payouts": [{"regular_member_id": payout_member.id, "amount": 5.0}],
        })
        assert resp.status_code == 403

    def test_unauthenticated_fails(self, client: TestClient, payout_member: RegularMember):
        resp = client.post("/api/v1/club/treasury-payout", json={
            "payouts": [{"regular_member_id": payout_member.id, "amount": 5.0}],
        })
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Club configuration export / import
# ---------------------------------------------------------------------------

class TestExportClubConfig:
    def test_requires_auth(self, client: TestClient):
        resp = client.get("/api/v1/club/config/export")
        assert resp.status_code == 401

    def test_member_cannot_export(self, client: TestClient, auth_headers: dict):
        resp = client.get("/api/v1/club/config/export", headers=auth_headers)
        assert resp.status_code == 403

    def test_export_empty_club(self, client: TestClient, admin_headers: dict):
        resp = client.get("/api/v1/club/config/export", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 1
        assert data["penalty_types"] == []
        assert data["game_templates"] == []
        assert data["teams"] == []
        assert data["pins"] == []

    def test_export_includes_setup_data(self, client: TestClient, admin_headers: dict,
                                         db: Session, club: Club):
        s = ClubSettings(
            club_id=club.id, home_venue="Krone", primary_color="#111111",
            secondary_color="#222222",
            extra={
                "bg_color": "#333333", "guest_penalty_cap": 5.0, "no_cancel_fee": 1.5,
                "pin_penalty": 2.0, "default_evening_time": "20:00",
                "throw_tracking_enabled": False, "audio_callouts_enabled": False,
                "paypal_me": "https://paypal.me/test",
                "ical_token": "secret-ical", "scoreboard_token": "secret-tv",
            },
        )
        db.add(s)
        db.add(PenaltyType(club_id=club.id, name="Null", icon="🎳", default_amount=1.0,
                            sound_key="buzzer"))
        db.add(GameTemplate(club_id=club.id, name="Große Hausnummer", winner_type="individual",
                             is_opener=True, default_loser_penalty=1.0, per_point_penalty=0,
                             sort_order=0))
        db.add(ClubTeam(club_id=club.id, name="Team A", sort_order=0))
        db.add(ClubPin(club_id=club.id, name="Vereinsnadel", icon="📌"))
        db.commit()

        resp = client.get("/api/v1/club/config/export", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["club_name"] == club.name
        assert data["settings"]["home_venue"] == "Krone"
        assert data["settings"]["bg_color"] == "#333333"
        assert data["settings"]["guest_penalty_cap"] == 5.0
        assert data["settings"]["throw_tracking_enabled"] is False
        assert "paypal_me" not in data["settings"]
        assert "ical_token" not in data["settings"]
        assert "scoreboard_token" not in data["settings"]
        assert "logo_url" not in data["settings"]
        assert len(data["penalty_types"]) == 1
        assert data["penalty_types"][0]["name"] == "Null"
        assert data["penalty_types"][0]["sound_key"] == "buzzer"
        assert len(data["game_templates"]) == 1
        assert data["game_templates"][0]["is_opener"] is True
        assert len(data["teams"]) == 1
        assert len(data["pins"]) == 1
        assert data["pins"][0]["name"] == "Vereinsnadel"
        assert "holder_regular_member_id" not in data["pins"][0]

    def test_export_omits_inactive_entries(self, client: TestClient, admin_headers: dict,
                                            db: Session, club: Club):
        db.add(PenaltyType(club_id=club.id, name="Inactive", icon="⚠️", default_amount=1.0,
                            is_active=False))
        db.commit()
        resp = client.get("/api/v1/club/config/export", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["penalty_types"] == []


class TestImportClubConfig:
    def _bundle(self, **overrides):
        base = {
            "version": 1,
            "settings": {"home_venue": "Neue Halle", "guest_penalty_cap": 3.0},
            "penalty_types": [{"icon": "🎳", "name": "Null", "default_amount": 1.0, "sort_order": 0,
                               "sound_key": "buzzer"}],
            "game_templates": [{"name": "Fass", "winner_type": "individual",
                                "default_loser_penalty": 0.5, "per_point_penalty": 0, "sort_order": 0}],
            "teams": [{"name": "Team A", "sort_order": 0}],
            "pins": [{"name": "Vereinsnadel", "icon": "📌"}],
        }
        base.update(overrides)
        return base

    def test_requires_auth(self, client: TestClient):
        resp = client.post("/api/v1/club/config/import", json=self._bundle())
        assert resp.status_code == 401

    def test_member_cannot_import(self, client: TestClient, auth_headers: dict):
        resp = client.post("/api/v1/club/config/import", headers=auth_headers, json=self._bundle())
        assert resp.status_code == 403

    def test_import_creates_setup_data(self, client: TestClient, admin_headers: dict,
                                        db: Session, club: Club):
        resp = client.post("/api/v1/club/config/import", headers=admin_headers, json=self._bundle())
        assert resp.status_code == 200
        assert resp.json() == {"ok": True, "penalty_types": 1, "game_templates": 1, "teams": 1, "pins": 1}

        pts = db.query(PenaltyType).filter(
            PenaltyType.club_id == club.id, PenaltyType.is_active == True).all()
        assert len(pts) == 1
        assert pts[0].name == "Null"
        assert pts[0].sound_key == "buzzer"

        gts = db.query(GameTemplate).filter(
            GameTemplate.club_id == club.id, GameTemplate.is_active == True).all()
        assert len(gts) == 1
        assert gts[0].name == "Fass"

        teams = db.query(ClubTeam).filter(
            ClubTeam.club_id == club.id, ClubTeam.is_active == True).all()
        assert len(teams) == 1

        pins = db.query(ClubPin).filter(ClubPin.club_id == club.id).all()
        assert len(pins) == 1
        assert pins[0].name == "Vereinsnadel"

        s = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
        assert s.home_venue == "Neue Halle"
        assert (s.extra or {}).get("guest_penalty_cap") == 3.0

    def test_import_replaces_existing_setup_data(self, client: TestClient, admin_headers: dict,
                                                  db: Session, club: Club):
        old_pt = PenaltyType(club_id=club.id, name="Old", icon="⚠️", default_amount=0.5)
        old_gt = GameTemplate(club_id=club.id, name="Old Game", winner_type="individual",
                              default_loser_penalty=0, per_point_penalty=0)
        old_team = ClubTeam(club_id=club.id, name="Old Team")
        old_pin = ClubPin(club_id=club.id, name="Old Pin")
        db.add_all([old_pt, old_gt, old_team, old_pin])
        db.commit()
        old_pt_id, old_gt_id, old_team_id = old_pt.id, old_gt.id, old_team.id

        resp = client.post("/api/v1/club/config/import", headers=admin_headers, json=self._bundle())
        assert resp.status_code == 200

        db.expire_all()
        assert db.query(PenaltyType).filter(PenaltyType.id == old_pt_id).first().is_active is False
        assert db.query(GameTemplate).filter(GameTemplate.id == old_gt_id).first().is_active is False
        assert db.query(ClubTeam).filter(ClubTeam.id == old_team_id).first().is_active is False
        assert db.query(ClubPin).filter(
            ClubPin.club_id == club.id, ClubPin.name == "Old Pin").first() is None

        active_pts = db.query(PenaltyType).filter(
            PenaltyType.club_id == club.id, PenaltyType.is_active == True).all()
        assert len(active_pts) == 1
        assert active_pts[0].name == "Null"

    def test_import_preserves_secret_tokens(self, client: TestClient, admin_headers: dict,
                                             db: Session, club: Club):
        s = ClubSettings(club_id=club.id, extra={"ical_token": "keep-me"})
        db.add(s)
        db.commit()
        resp = client.post("/api/v1/club/config/import", headers=admin_headers, json=self._bundle())
        assert resp.status_code == 200
        db.expire_all()
        s2 = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
        assert s2.extra.get("ical_token") == "keep-me"

    def test_import_rejects_unsupported_version(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/config/import", headers=admin_headers,
                           json=self._bundle(version=999))
        assert resp.status_code == 400

    def test_import_drops_unknown_sound_key(self, client: TestClient, admin_headers: dict,
                                             db: Session, club: Club):
        bundle = self._bundle(penalty_types=[{"icon": "⚠️", "name": "X", "default_amount": 1.0,
                                              "sort_order": 0, "sound_key": "not-real"}])
        resp = client.post("/api/v1/club/config/import", headers=admin_headers, json=bundle)
        assert resp.status_code == 200
        pt = db.query(PenaltyType).filter(
            PenaltyType.club_id == club.id, PenaltyType.is_active == True).first()
        assert pt.sound_key is None

    def test_import_tolerates_legacy_sort_order_field(self, client: TestClient, admin_headers: dict,
                                                       db: Session, club: Club):
        # Bundles exported before 056 carry a per-penalty sort_order; they must still import.
        bundle = self._bundle(penalty_types=[{"icon": "⚠️", "name": "Alt", "default_amount": 1.0,
                                              "sort_order": 99, "sound_key": None}])
        resp = client.post("/api/v1/club/config/import", headers=admin_headers, json=bundle)
        assert resp.status_code == 200
        pt = db.query(PenaltyType).filter(
            PenaltyType.club_id == club.id, PenaltyType.is_active == True).first()
        assert pt.name == "Alt"

    def test_import_empty_bundle_deactivates_everything(self, client: TestClient, admin_headers: dict,
                                                          db: Session, club: Club):
        db.add(PenaltyType(club_id=club.id, name="Old", icon="⚠️", default_amount=0.5))
        db.commit()
        resp = client.post("/api/v1/club/config/import", headers=admin_headers, json=self._bundle(
            penalty_types=[], game_templates=[], teams=[], pins=[],
        ))
        assert resp.status_code == 200
        assert resp.json() == {"ok": True, "penalty_types": 0, "game_templates": 0, "teams": 0, "pins": 0}
        active_pts = db.query(PenaltyType).filter(
            PenaltyType.club_id == club.id, PenaltyType.is_active == True).all()
        assert active_pts == []

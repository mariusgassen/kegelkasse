"""
Tests for the shared request-body trimming (core/schemas.py::TrimmedModel).

A stray leading/trailing space is invisible in the form that produced it but very visible in
exports, reports and the config bundle, and it silently breaks name matching. Trimming lives on the
schema base rather than in each form, so these tests check it holds across unrelated routers — and
that it explicitly does *not* touch secrets.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.schemas import TrimmedModel
from core.security import create_access_token, get_password_hash
from models.club import Club, ClubPin
from models.evening import RegularMember, ClubTeam
from models.penalty import PenaltyType
from models.user import User, UserRole


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.query(ClubPin).filter(ClubPin.club_id == club.id).delete(synchronize_session=False)
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubTeam).filter(ClubTeam.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id, User.email.like("%trim%")).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin_headers(db: Session, club: Club) -> dict:
    u = User(
        email="admin_trim@test.de",
        name="Admin Trim",
        hashed_password=get_password_hash("x"),
        role=UserRole.admin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


class TestTrimmedModel:
    def test_strips_leading_and_trailing_whitespace(self):
        class Body(TrimmedModel):
            name: str

        assert Body(name="  Pin fehlt  ").name == "Pin fehlt"

    def test_keeps_inner_whitespace(self):
        class Body(TrimmedModel):
            name: str

        assert Body(name="  Kugel von Bahn  ").name == "Kugel von Bahn"

    def test_strips_tabs_and_newlines(self):
        class Body(TrimmedModel):
            name: str

        assert Body(name="\n\tHolländer \n").name == "Holländer"

    def test_leaves_non_strings_alone(self):
        class Body(TrimmedModel):
            amount: float
            flag: bool
            missing: str | None = None

        body = Body(amount=1.5, flag=True)
        assert (body.amount, body.flag, body.missing) == (1.5, True, None)

    def test_does_not_touch_passwords_or_secrets(self):
        # Whitespace can be part of a credential; trimming one turns a correct password into a
        # wrong one, which would look like a broken login with nothing in the logs.
        class Body(TrimmedModel):
            password: str
            new_password: str
            secret_token: str

        body = Body(password="  hunter2  ", new_password=" a b ", secret_token=" s ")
        assert body.password == "  hunter2  "
        assert body.new_password == " a b "
        assert body.secret_token == " s "

    def test_nested_models_are_trimmed_too(self):
        class Inner(TrimmedModel):
            name: str

        class Outer(TrimmedModel):
            title: str
            inner: Inner

        outer = Outer(title=" Outer ", inner={"name": " Inner "})
        assert (outer.title, outer.inner.name) == ("Outer", "Inner")


class TestTrimmingAcrossRouters:
    def test_penalty_type_name_and_icon(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/penalty-types", headers=admin_headers,
                           json={"name": "Pin fehlt ", "icon": " 🎳 ", "default_amount": 5.0})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Pin fehlt"
        assert resp.json()["icon"] == "🎳"

    def test_penalty_type_update(self, client: TestClient, admin_headers: dict):
        created = client.post("/api/v1/club/penalty-types", headers=admin_headers,
                              json={"name": "X", "icon": "⚠️", "default_amount": 1.0}).json()
        resp = client.put(f"/api/v1/club/penalty-types/{created['id']}", headers=admin_headers,
                          json={"name": "  Körperverletzung  ", "icon": "👊", "default_amount": 5.0})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Körperverletzung"

    def test_pin_name(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/pins", headers=admin_headers,
                           json={"name": "  Geldglas  ", "icon": "💸"})
        assert resp.status_code == 201
        assert resp.json()["name"] == "Geldglas"

    def test_regular_member_name_and_nickname(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/regular-members", headers=admin_headers,
                           json={"name": " Marius Gassen ", "nickname": " Schneggo "})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Marius Gassen"
        assert resp.json()["nickname"] == "Schneggo"

    def test_club_team_name(self, client: TestClient, admin_headers: dict):
        resp = client.post("/api/v1/club/teams", headers=admin_headers,
                           json={"name": " Tafel ", "sort_order": 0})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Tafel"

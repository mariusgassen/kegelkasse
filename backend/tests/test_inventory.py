"""
Tests for the Zeugwart inventory endpoints:
  GET/PATCH /inventory/keepers[/{mid}]
  GET/POST /inventory/, PATCH/DELETE /inventory/{iid}
  GET/POST /inventory/{iid}/movements
"""
import pytest
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.evening import RegularMember
from models.inventory import InventoryItem, InventoryMovement
from models.user import User, UserRole


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    ids = [i.id for i in db.query(InventoryItem).filter(InventoryItem.club_id == club.id).all()]
    if ids:
        db.query(InventoryMovement).filter(InventoryMovement.item_id.in_(ids)).delete(synchronize_session=False)
    db.query(InventoryItem).filter(InventoryItem.club_id == club.id).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id).update({User.regular_member_id: None},
                                                          synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


def _headers(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


@pytest.fixture()
def admin(db, club):
    u = User(email="inv_admin@test.de", name="Admin", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def keeper_member(db, club):
    rm = RegularMember(club_id=club.id, name="Zeugwart Zoe", nickname="Zoe", is_active=True)
    db.add(rm)
    db.commit()
    db.refresh(rm)
    return rm


@pytest.fixture()
def keeper(db, club, keeper_member):
    keeper_member.is_zeugwart = True
    u = User(email="zeugwart@test.de", name="Zoe", hashed_password=get_password_hash("x"),
             role=UserRole.member, club_id=club.id, is_active=True, regular_member_id=keeper_member.id)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _create(client, who, **body):
    payload = {"name": "Sticker", "icon": "🏷️", "stock": 10, "target": 50, **body}
    r = client.post("/api/v1/inventory/", json=payload, headers=_headers(who))
    assert r.status_code == 201, r.text
    return r.json()


class TestKeepers:
    def test_admin_appoints_and_lists(self, client, admin, keeper_member, auth_headers):
        r = client.patch(f"/api/v1/inventory/keepers/{keeper_member.id}", json={"is_zeugwart": True},
                         headers=_headers(admin))
        assert r.status_code == 200
        r = client.get("/api/v1/inventory/keepers", headers=auth_headers)
        assert [k["nickname"] for k in r.json()] == ["Zoe"]

    def test_member_cannot_appoint(self, client, keeper_member, auth_headers):
        r = client.patch(f"/api/v1/inventory/keepers/{keeper_member.id}", json={"is_zeugwart": True},
                         headers=auth_headers)
        assert r.status_code == 403

    def test_guest_cannot_be_keeper(self, client, db, club, admin):
        g = RegularMember(club_id=club.id, name="Gast", is_guest=True, is_active=True)
        db.add(g)
        db.commit()
        r = client.patch(f"/api/v1/inventory/keepers/{g.id}", json={"is_zeugwart": True}, headers=_headers(admin))
        assert r.status_code == 400

    def test_flag_in_member_list(self, client, keeper, auth_headers):
        rows = client.get("/api/v1/club/regular-members", headers=auth_headers).json()
        assert any(m["is_zeugwart"] for m in rows)


class TestItems:
    def test_requires_auth(self, client):
        assert client.get("/api/v1/inventory/").status_code in (401, 403)

    def test_member_reads_but_cannot_edit(self, client, keeper, auth_headers):
        item = _create(client, keeper)
        r = client.get("/api/v1/inventory/", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["can_edit"] is False
        assert r.json()["items"][0]["id"] == item["id"]
        assert client.post("/api/v1/inventory/", json={"name": "X"}, headers=auth_headers).status_code == 403
        assert client.patch(f"/api/v1/inventory/{item['id']}", json={"target": 1},
                            headers=auth_headers).status_code == 403
        assert client.post(f"/api/v1/inventory/{item['id']}/movements", json={"delta": 1},
                           headers=auth_headers).status_code == 403
        assert client.delete(f"/api/v1/inventory/{item['id']}", headers=auth_headers).status_code == 403

    def test_keeper_and_admin_can_edit(self, client, keeper, admin):
        assert client.get("/api/v1/inventory/", headers=_headers(keeper)).json()["can_edit"] is True
        assert client.get("/api/v1/inventory/", headers=_headers(admin)).json()["can_edit"] is True

    def test_create_records_initial_stock(self, client, keeper):
        item = _create(client, keeper, stock=10, target=50)
        assert item["stock"] == 10
        assert item["missing"] == 40
        moves = client.get(f"/api/v1/inventory/{item['id']}/movements", headers=_headers(keeper)).json()
        assert len(moves) == 1
        assert moves[0]["delta"] == 10 and moves[0]["stock_after"] == 10
        assert moves[0]["actor_name"] == "Zoe"

    def test_create_without_stock_has_no_movement(self, client, admin):
        item = _create(client, admin, stock=0)
        assert client.get(f"/api/v1/inventory/{item['id']}/movements", headers=_headers(admin)).json() == []

    def test_create_validation(self, client, admin):
        h = _headers(admin)
        assert client.post("/api/v1/inventory/", json={"name": "  "}, headers=h).status_code == 400
        assert client.post("/api/v1/inventory/", json={"name": "A", "target": -1}, headers=h).status_code == 400
        assert client.post("/api/v1/inventory/", json={"name": "A", "stock": -3}, headers=h).status_code == 400

    def test_update_details_not_stock(self, client, admin):
        item = _create(client, admin)
        r = client.patch(f"/api/v1/inventory/{item['id']}",
                         json={"name": "Aufkleber", "target": 5, "note": "rund", "stock": 999},
                         headers=_headers(admin))
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Aufkleber" and body["target"] == 5 and body["note"] == "rund"
        assert body["stock"] == 10 and body["missing"] == 0

    def test_update_rejects_empty_name(self, client, admin):
        item = _create(client, admin)
        r = client.patch(f"/api/v1/inventory/{item['id']}", json={"name": ""}, headers=_headers(admin))
        assert r.status_code == 400

    def test_delete_hides_item(self, client, admin):
        item = _create(client, admin)
        assert client.delete(f"/api/v1/inventory/{item['id']}", headers=_headers(admin)).status_code == 204
        assert client.get("/api/v1/inventory/", headers=_headers(admin)).json()["items"] == []
        assert client.get(f"/api/v1/inventory/{item['id']}/movements",
                          headers=_headers(admin)).status_code == 404

    def test_other_club_item_not_found(self, client, db, admin):
        other = Club(name="Other", slug="other-inv")
        db.add(other)
        db.commit()
        foreign = InventoryItem(club_id=other.id, name="Fremd", stock=1, target=1)
        db.add(foreign)
        db.commit()
        try:
            assert client.get(f"/api/v1/inventory/{foreign.id}/movements",
                              headers=_headers(admin)).status_code == 404
            assert client.get("/api/v1/inventory/", headers=_headers(admin)).json()["items"] == []
        finally:
            db.delete(foreign)
            db.delete(other)
            db.commit()


class TestMovements:
    def test_in_and_out(self, client, keeper):
        item = _create(client, keeper, stock=10)
        h = _headers(keeper)
        r = client.post(f"/api/v1/inventory/{item['id']}/movements", json={"delta": 5, "note": "Nachbestellt"},
                        headers=h)
        assert r.status_code == 201 and r.json()["stock"] == 15
        r = client.post(f"/api/v1/inventory/{item['id']}/movements", json={"delta": -3}, headers=h)
        assert r.json()["stock"] == 12
        moves = client.get(f"/api/v1/inventory/{item['id']}/movements", headers=h).json()
        assert [m["delta"] for m in moves] == [-3, 5, 10]
        assert moves[1]["note"] == "Nachbestellt"

    def test_cannot_go_negative(self, client, keeper):
        item = _create(client, keeper, stock=2)
        r = client.post(f"/api/v1/inventory/{item['id']}/movements", json={"delta": -3}, headers=_headers(keeper))
        assert r.status_code == 400

    def test_recount_records_difference(self, client, keeper):
        item = _create(client, keeper, stock=10)
        h = _headers(keeper)
        r = client.post(f"/api/v1/inventory/{item['id']}/movements", json={"count": 7, "note": "Inventur"},
                        headers=h)
        assert r.json()["stock"] == 7
        assert client.get(f"/api/v1/inventory/{item['id']}/movements", headers=h).json()[0]["delta"] == -3

    def test_invalid_movement_bodies(self, client, keeper):
        item = _create(client, keeper, stock=4)
        url = f"/api/v1/inventory/{item['id']}/movements"
        h = _headers(keeper)
        assert client.post(url, json={}, headers=h).status_code == 400
        assert client.post(url, json={"delta": 1, "count": 2}, headers=h).status_code == 400
        assert client.post(url, json={"delta": 0}, headers=h).status_code == 400
        assert client.post(url, json={"count": 4}, headers=h).status_code == 400
        assert client.post(url, json={"count": -1}, headers=h).status_code == 400

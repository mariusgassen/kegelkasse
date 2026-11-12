"""
Tests for the community-driven roadmap endpoints:
  GET /roadmap
  POST /roadmap/items
  POST /roadmap/items/{item_id}/vote
  PATCH /roadmap/items/{item_id}
  DELETE /roadmap/items/{item_id}
"""
import pytest
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.roadmap import RoadmapItem, RoadmapVote
from models.user import User, UserRole


def _headers(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    item_ids = [i.id for i in db.query(RoadmapItem).filter(
        (RoadmapItem.club_id == club.id) | (RoadmapItem.club_id.is_(None))
    ).all()]
    if item_ids:
        db.query(RoadmapVote).filter(RoadmapVote.item_id.in_(item_ids)).delete(synchronize_session=False)
        db.query(RoadmapItem).filter(RoadmapItem.id.in_(item_ids)).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin(db: Session, club: Club):
    u = User(
        email="roadmap_admin@test.de",
        name="Roadmap Admin",
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
def superadmin(db: Session):
    u = User(
        email="roadmap_super@test.de",
        name="Roadmap Superadmin",
        hashed_password=get_password_hash("x"),
        role=UserRole.superadmin,
        club_id=None,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_list_roadmap_unauthenticated(client):
    r = client.get("/api/v1/roadmap")
    assert r.status_code == 401


def test_list_roadmap_empty_or_official(client, user, auth_headers, db):
    official = RoadmapItem(
        title="Desktop-Master-Detail",
        description="Fresh look and feel",
        status="planned",
        is_official=True,
        is_pinned=True,
        tags="desktop, ui",
    )
    db.add(official)
    db.commit()

    r = client.get("/api/v1/roadmap", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    titles = [x["title"] for x in data]
    assert "Desktop-Master-Detail" in titles
    official_entry = next(x for x in data if x["title"] == "Desktop-Master-Detail")
    assert official_entry["is_official"] is True
    assert official_entry["is_pinned"] is True
    assert "desktop" in official_entry["tags"]
    assert official_entry["vote_count"] == 0
    assert official_entry["has_voted"] is False


def test_create_roadmap_item(client, user, auth_headers, db):
    payload = {
        "title": "Königs-Tippspiel für Abende",
        "description": "Tippen vor dem Spiel",
        "category": "evening",
        "tags": "tippspiel, king",
    }
    r = client.post("/api/v1/roadmap/items", json=payload, headers=auth_headers)
    assert r.status_code == 201
    created = r.json()
    assert created["title"] == "Königs-Tippspiel für Abende"
    assert created["description"] == "Tippen vor dem Spiel"
    assert created["category"] == "evening"
    assert "tippspiel" in created["tags"]
    assert created["status"] == "idea"
    assert created["vote_count"] == 1
    assert created["has_voted"] is True
    assert created["is_official"] is False
    assert created["club_id"] == user.club_id


def test_create_roadmap_item_validation(client, auth_headers):
    r = client.post("/api/v1/roadmap/items", json={"title": " "}, headers=auth_headers)
    assert r.status_code == 400

    r = client.post("/api/v1/roadmap/items", json={"title": "A" * 201}, headers=auth_headers)
    assert r.status_code == 400


def test_toggle_vote(client, user, second_user, auth_headers, db):
    item = RoadmapItem(
        title="Bierkrug-Zähler",
        status="idea",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.commit()

    r = client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=auth_headers)
    assert r.status_code == 200
    res = r.json()
    assert res["has_voted"] is True
    assert res["vote_count"] == 1

    h2 = _headers(second_user)
    r2 = client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=h2)
    assert r2.status_code == 200
    res2 = r2.json()
    assert res2["has_voted"] is True
    assert res2["vote_count"] == 2

    r3 = client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=auth_headers)
    assert r3.status_code == 200
    res3 = r3.json()
    assert res3["has_voted"] is False
    assert res3["vote_count"] == 1

    r_bad = client.post("/api/v1/roadmap/items/99999/vote", headers=auth_headers)
    assert r_bad.status_code == 404


def test_admin_move_tag_pin_duplicate(client, admin, user, auth_headers, db):
    admin_hdr = _headers(admin)
    target_item = RoadmapItem(
        title="Kassenbuch Export",
        status="planned",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    dup_item = RoadmapItem(
        title="CSV Export Kasse",
        status="idea",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    db.add_all([target_item, dup_item])
    db.commit()

    # Admin pins/marks target item
    r_pin = client.patch(
        f"/api/v1/roadmap/items/{target_item.id}",
        json={"is_pinned": True, "category": "kasse", "tags": "export, csv, excel"},
        headers=admin_hdr,
    )
    assert r_pin.status_code == 200
    data_pin = r_pin.json()
    assert data_pin["is_pinned"] is True
    assert data_pin["category"] == "kasse"
    assert "export" in data_pin["tags"]

    # Admin marks dup_item as duplicate of target_item
    r_dup = client.patch(
        f"/api/v1/roadmap/items/{dup_item.id}",
        json={"duplicate_of_id": target_item.id, "admin_notes": "Bereits in Planung"},
        headers=admin_hdr,
    )
    assert r_dup.status_code == 200
    data_dup = r_dup.json()
    assert data_dup["status"] == "duplicate"
    assert data_dup["duplicate_of_id"] == target_item.id
    assert data_dup["duplicate_of_title"] == "Kassenbuch Export"
    assert data_dup["admin_notes"] == "Bereits in Planung"

    # Self duplicate fails
    r_self = client.patch(
        f"/api/v1/roadmap/items/{target_item.id}",
        json={"duplicate_of_id": target_item.id},
        headers=admin_hdr,
    )
    assert r_self.status_code == 400


def test_update_roadmap_item_by_creator(client, user, auth_headers, db):
    item = RoadmapItem(
        title="My Feature",
        description="Original text",
        status="idea",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.commit()

    r = client.patch(
        f"/api/v1/roadmap/items/{item.id}",
        json={"title": "My Updated Feature", "description": "New description"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "My Updated Feature"
    assert data["description"] == "New description"


def test_delete_roadmap_item(client, user, second_user, admin, superadmin, db):
    h_user = _headers(user)
    h_user2 = _headers(second_user)
    h_admin = _headers(admin)
    h_super = _headers(superadmin)

    item = RoadmapItem(
        title="Delete Me",
        status="idea",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.commit()

    r_no = client.delete(f"/api/v1/roadmap/items/{item.id}", headers=h_user2)
    assert r_no.status_code == 403

    r_del = client.delete(f"/api/v1/roadmap/items/{item.id}", headers=h_user)
    assert r_del.status_code == 200
    assert db.query(RoadmapItem).filter(RoadmapItem.id == item.id).first() is None

    official = RoadmapItem(
        title="Official Item",
        status="planned",
        is_official=True,
    )
    db.add(official)
    db.commit()

    r_admin_no = client.delete(f"/api/v1/roadmap/items/{official.id}", headers=h_admin)
    assert r_admin_no.status_code == 403

    r_super_del = client.delete(f"/api/v1/roadmap/items/{official.id}", headers=h_super)
    assert r_super_del.status_code == 200
    assert db.query(RoadmapItem).filter(RoadmapItem.id == official.id).first() is None


def test_product_manager_permissions(client, user, db):
    pm = User(
        email="pm@test.de",
        name="Product Manager",
        hashed_password=get_password_hash("pass"),
        role=UserRole.product_manager,
        club_id=None,  # PM has cross-club rights
        is_active=True,
    )
    db.add(pm)
    db.commit()
    pm_headers = _headers(pm)

    # PM creates official/global item
    item = RoadmapItem(
        title="Live Scoring Overlay",
        status="idea",
        is_official=True,
    )
    db.add(item)
    db.commit()

    # PM moves status, pins, and adds admin notes
    r_patch = client.patch(
        f"/api/v1/roadmap/items/{item.id}",
        json={
            "status": "planned",
            "is_pinned": True,
            "category": "evening",
            "tags": "overlay, obs, stream",
            "admin_notes": "Geplant für Q3",
        },
        headers=pm_headers,
    )
    assert r_patch.status_code == 200
    data = r_patch.json()
    assert data["status"] == "planned"
    assert data["is_pinned"] is True
    assert data["category"] == "evening"
    assert "overlay" in data["tags"]
    assert data["admin_notes"] == "Geplant für Q3"

    # PM can delete official item
    r_del = client.delete(f"/api/v1/roadmap/items/{item.id}", headers=pm_headers)
    assert r_del.status_code == 200
    assert db.query(RoadmapItem).filter(RoadmapItem.id == item.id).first() is None


def test_roadmap_comments_integration(client, user, second_user, auth_headers, db):
    item = RoadmapItem(
        title="Bierrunden-Rechner",
        status="idea",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.commit()

    # Post comment on roadmap item
    r_comment = client.post(
        f"/api/v1/comments/roadmap/{item.id}",
        json={"text": "Super Idee, bitte auch für Schnaps!"},
        headers=auth_headers,
    )
    assert r_comment.status_code == 200
    c_data = r_comment.json()
    assert c_data["text"] == "Super Idee, bitte auch für Schnaps!"

    # List comments on roadmap item
    r_list = client.get(f"/api/v1/comments/roadmap/{item.id}", headers=auth_headers)
    assert r_list.status_code == 200
    list_data = r_list.json()
    assert len(list_data) == 1
    assert list_data[0]["id"] == c_data["id"]

    # Toggle reaction on comment
    r_react = client.post(
        f"/api/v1/comments/{c_data['id']}/reactions",
        json={"emoji": "👍"},
        headers=_headers(second_user),
    )
    assert r_react.status_code == 200

    # Roadmap item list returns comment_count == 1
    r_road = client.get("/api/v1/roadmap", headers=auth_headers)
    assert r_road.status_code == 200
    items = r_road.json()
    target = next(it for it in items if it["id"] == item.id)
    assert target["comment_count"] == 1

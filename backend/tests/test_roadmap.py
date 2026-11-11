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
    # Delete votes first (FK to item), then items
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
    # Create an official item and a club item
    official = RoadmapItem(
        title="2.0 Redesign",
        description="Fresh look and feel",
        status="planned",
        target_version="2.0",
        is_official=True,
    )
    db.add(official)
    db.commit()

    r = client.get("/api/v1/roadmap", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    titles = [x["title"] for x in data]
    assert "2.0 Redesign" in titles
    official_entry = next(x for x in data if x["title"] == "2.0 Redesign")
    assert official_entry["is_official"] is True
    assert official_entry["vote_count"] == 0
    assert official_entry["has_voted"] is False


def test_create_roadmap_item(client, user, auth_headers, db):
    payload = {
        "title": "Königs-Tippspiel für Abende",
        "description": "Tippen vor dem Spiel",
        "category": "feature",
    }
    r = client.post("/api/v1/roadmap/items", json=payload, headers=auth_headers)
    assert r.status_code == 201
    created = r.json()
    assert created["title"] == "Königs-Tippspiel für Abende"
    assert created["description"] == "Tippen vor dem Spiel"
    assert created["status"] == "idea"
    assert created["vote_count"] == 1
    assert created["has_voted"] is True
    assert created["is_official"] is False
    assert created["club_id"] == user.club_id

    # Verify in DB
    item = db.query(RoadmapItem).filter(RoadmapItem.id == created["id"]).first()
    assert item is not None
    assert item.title == "Königs-Tippspiel für Abende"


def test_create_roadmap_item_validation(client, auth_headers):
    # Empty title
    r = client.post("/api/v1/roadmap/items", json={"title": " "}, headers=auth_headers)
    assert r.status_code == 400

    # Too long
    r = client.post("/api/v1/roadmap/items", json={"title": "A" * 201}, headers=auth_headers)
    assert r.status_code == 400


def test_toggle_vote(client, user, second_user, auth_headers, db):
    # Create an item
    item = RoadmapItem(
        title="Bierkrug-Zähler",
        status="idea",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.commit()

    # User 1 votes
    r = client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=auth_headers)
    assert r.status_code == 200
    res = r.json()
    assert res["has_voted"] is True
    assert res["vote_count"] == 1

    # User 2 votes
    h2 = _headers(second_user)
    r2 = client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=h2)
    assert r2.status_code == 200
    res2 = r2.json()
    assert res2["has_voted"] is True
    assert res2["vote_count"] == 2

    # User 1 toggles off
    r3 = client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=auth_headers)
    assert r3.status_code == 200
    res3 = r3.json()
    assert res3["has_voted"] is False
    assert res3["vote_count"] == 1

    # Non-existent item
    r_bad = client.post("/api/v1/roadmap/items/99999/vote", headers=auth_headers)
    assert r_bad.status_code == 404


def test_update_roadmap_item_by_admin(client, admin, user, auth_headers, db):
    admin_hdr = _headers(admin)
    item = RoadmapItem(
        title="Admin-Audit-Log",
        status="idea",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.commit()

    # Regular user cannot change status
    r_forbidden = client.patch(
        f"/api/v1/roadmap/items/{item.id}",
        json={"status": "planned"},
        headers=auth_headers,
    )
    assert r_forbidden.status_code == 403

    # Admin changes status to planned and sets target_version
    r_admin = client.patch(
        f"/api/v1/roadmap/items/{item.id}",
        json={"status": "planned", "target_version": "2.0"},
        headers=admin_hdr,
    )
    assert r_admin.status_code == 200
    updated = r_admin.json()
    assert updated["status"] == "planned"
    assert updated["target_version"] == "2.0"

    # Invalid status
    r_bad = client.patch(
        f"/api/v1/roadmap/items/{item.id}",
        json={"status": "invalid_status"},
        headers=admin_hdr,
    )
    assert r_bad.status_code == 400


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

    # Creator can delete own idea
    item = RoadmapItem(
        title="Delete Me",
        status="idea",
        club_id=user.club_id,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.commit()

    # User 2 cannot delete User 1's idea
    r_no = client.delete(f"/api/v1/roadmap/items/{item.id}", headers=h_user2)
    assert r_no.status_code == 403

    # User 1 can delete
    r_del = client.delete(f"/api/v1/roadmap/items/{item.id}", headers=h_user)
    assert r_del.status_code == 200
    assert db.query(RoadmapItem).filter(RoadmapItem.id == item.id).first() is None

    # Official item cannot be deleted by club admin
    official = RoadmapItem(
        title="Official Item",
        status="planned",
        is_official=True,
    )
    db.add(official)
    db.commit()

    r_admin_no = client.delete(f"/api/v1/roadmap/items/{official.id}", headers=h_admin)
    assert r_admin_no.status_code == 403

    # Superadmin can delete official item
    r_super_del = client.delete(f"/api/v1/roadmap/items/{official.id}", headers=h_super)
    assert r_super_del.status_code == 200
    assert db.query(RoadmapItem).filter(RoadmapItem.id == official.id).first() is None

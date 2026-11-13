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
from api.v1 import roadmap as roadmap_api
from models.club import Club
from models.comment import Comment
from models.roadmap import RoadmapItem, RoadmapVote
from models.user import User, UserRole


def _headers(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    roadmap_api._create_limiter.reset()
    yield
    db.rollback()
    db.query(Comment).filter(Comment.parent_type == "roadmap").delete(synchronize_session=False)
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


# ---------------------------------------------------------------------------
# Hardening: permissions, validation, votes, duplicates, deletion, notifications
# ---------------------------------------------------------------------------

@pytest.fixture()
def other_club_admin(db: Session):
    c = Club(name="Other Club", slug="other-club-roadmap")
    db.add(c)
    db.commit()
    db.refresh(c)
    u = User(
        email="other_admin@test.de", name="Other Admin", hashed_password=get_password_hash("x"),
        role=UserRole.admin, club_id=c.id, is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u
    db.rollback()
    ids = [i.id for i in db.query(RoadmapItem).filter(RoadmapItem.club_id == c.id).all()]
    if ids:
        db.query(RoadmapVote).filter(RoadmapVote.item_id.in_(ids)).delete(synchronize_session=False)
        db.query(RoadmapItem).filter(RoadmapItem.id.in_(ids)).delete(synchronize_session=False)
    db.query(User).filter(User.id == u.id).delete(synchronize_session=False)
    db.delete(c)
    db.commit()


def _item(db, **kw) -> RoadmapItem:
    it = RoadmapItem(title=kw.pop("title", "Idee"), status=kw.pop("status", "idea"), **kw)
    db.add(it)
    db.commit()
    db.refresh(it)
    return it


def test_club_admin_cannot_manage_official_item(client, admin, db):
    official = _item(db, is_official=True, status="planned")
    r = client.patch(f"/api/v1/roadmap/items/{official.id}", json={"status": "completed"}, headers=_headers(admin))
    assert r.status_code == 403
    r = client.patch(f"/api/v1/roadmap/items/{official.id}", json={"is_pinned": True}, headers=_headers(admin))
    assert r.status_code == 403


def test_club_admin_cannot_touch_other_club_item(client, admin, other_club_admin, db):
    foreign = _item(db, club_id=other_club_admin.club_id, created_by_user_id=other_club_admin.id)
    assert client.patch(f"/api/v1/roadmap/items/{foreign.id}", json={"status": "planned"}, headers=_headers(admin)).status_code == 403
    assert client.delete(f"/api/v1/roadmap/items/{foreign.id}", headers=_headers(admin)).status_code == 403
    # Voting is global: members of any club can back an idea.
    assert client.post(f"/api/v1/roadmap/items/{foreign.id}/vote", headers=_headers(admin)).status_code == 200


def test_list_shows_other_club_items(client, user, auth_headers, other_club_admin, db):
    _item(db, title="Fremd", club_id=other_club_admin.club_id)
    titles = [x["title"] for x in client.get("/api/v1/roadmap", headers=auth_headers).json()]
    assert "Fremd" in titles


def test_duplicate_target_may_be_in_other_club(client, admin, other_club_admin, db):
    mine = _item(db, club_id=admin.club_id, created_by_user_id=admin.id)
    foreign = _item(db, title="Geheim", club_id=other_club_admin.club_id)
    r = client.patch(f"/api/v1/roadmap/items/{mine.id}", json={"duplicate_of_id": foreign.id}, headers=_headers(admin))
    assert r.status_code == 200


def test_duplicate_loop_rejected_and_link_cleared(client, admin, db):
    a = _item(db, title="A", club_id=admin.club_id)
    b = _item(db, title="B", club_id=admin.club_id)
    h = _headers(admin)
    assert client.patch(f"/api/v1/roadmap/items/{a.id}", json={"duplicate_of_id": b.id}, headers=h).status_code == 200
    r = client.patch(f"/api/v1/roadmap/items/{b.id}", json={"duplicate_of_id": a.id}, headers=h)
    assert r.status_code == 400
    # Moving a duplicate back to another status drops the stale link.
    r = client.patch(f"/api/v1/roadmap/items/{a.id}", json={"status": "planned"}, headers=h)
    assert r.status_code == 200
    assert r.json()["duplicate_of_id"] is None


def test_duplicate_votes_count_for_main_item(client, user, second_user, admin, db):
    main = _item(db, title="Haupt", club_id=user.club_id)
    dup = _item(db, title="Doppelt", club_id=user.club_id)
    db.add_all([
        RoadmapVote(item_id=main.id, user_id=user.id),
        RoadmapVote(item_id=dup.id, user_id=user.id),         # same voter must not count twice
        RoadmapVote(item_id=dup.id, user_id=second_user.id),
    ])
    db.commit()
    client.patch(f"/api/v1/roadmap/items/{dup.id}", json={"duplicate_of_id": main.id}, headers=_headers(admin))
    rows = {x["id"]: x for x in client.get("/api/v1/roadmap", headers=_headers(admin)).json()}
    assert rows[main.id]["vote_count"] == 2
    assert rows[dup.id]["vote_count"] == 2


def test_vote_closed_on_rejected_but_withdrawable(client, user, auth_headers, db):
    item = _item(db, status="rejected", club_id=user.club_id)
    assert client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=auth_headers).status_code == 400
    db.add(RoadmapVote(item_id=item.id, user_id=user.id))
    db.commit()
    r = client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=auth_headers)
    assert r.status_code == 200 and r.json()["has_voted"] is False


def test_vote_race_is_not_a_500(client, user, auth_headers, db, monkeypatch):
    item = _item(db, club_id=user.club_id)

    # A concurrent request stores the vote between our existence check and our insert.
    real_commit = db.commit
    state = {"raised": False}

    def racing_commit():
        if not state["raised"] and any(isinstance(o, RoadmapVote) for o in db.new):
            state["raised"] = True
            from sqlalchemy.exc import IntegrityError
            raise IntegrityError("insert", {}, Exception("unique"))
        return real_commit()

    monkeypatch.setattr(db, "commit", racing_commit, raising=False)
    r = client.post(f"/api/v1/roadmap/items/{item.id}/vote", headers=auth_headers)
    assert state["raised"], "the endpoint never hit the simulated race"
    assert r.status_code == 200


def test_field_length_validation(client, user, auth_headers, db):
    h = auth_headers
    assert client.post("/api/v1/roadmap/items", json={"title": "ok", "description": "x" * 4001}, headers=h).status_code == 400
    assert client.post("/api/v1/roadmap/items", json={"title": "ok", "category": "c" * 51}, headers=h).status_code == 400
    assert client.post("/api/v1/roadmap/items", json={"title": "ok", "tags": ",".join(f"t{i}" for i in range(9))}, headers=h).status_code == 400
    assert client.post("/api/v1/roadmap/items", json={"title": "ok", "tags": "x" * 31}, headers=h).status_code == 400
    item = _item(db, club_id=user.club_id, created_by_user_id=user.id)
    assert client.patch(f"/api/v1/roadmap/items/{item.id}", json={"title": "A" * 201}, headers=h).status_code == 400


def test_tags_are_normalized(client, auth_headers):
    r = client.post("/api/v1/roadmap/items", json={"title": "Tags", "tags": " ui, #UI , kasse ,, "}, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["tags"] == ["ui", "kasse"]


def test_create_is_rate_limited(client, auth_headers):
    for i in range(roadmap_api.CREATE_LIMIT_PER_HOUR):
        assert client.post("/api/v1/roadmap/items", json={"title": f"Idee {i}"}, headers=auth_headers).status_code == 201
    assert client.post("/api/v1/roadmap/items", json={"title": "Zu viel"}, headers=auth_headers).status_code == 429


def test_tag_filter_matches_exact_tag(client, user, auth_headers, db):
    _item(db, title="UI", club_id=user.club_id, tags="ui, kasse")
    _item(db, title="Build", club_id=user.club_id, tags="build")
    titles = [x["title"] for x in client.get("/api/v1/roadmap?tag=ui", headers=auth_headers).json()]
    assert titles == ["UI"]


def test_list_pagination(client, user, auth_headers, db):
    for i in range(5):
        _item(db, title=f"P{i}", club_id=user.club_id)
    page1 = client.get("/api/v1/roadmap?limit=2", headers=auth_headers).json()
    page2 = client.get("/api/v1/roadmap?limit=2&offset=2", headers=auth_headers).json()
    assert len(page1) == 2 and len(page2) == 2
    assert {x["id"] for x in page1}.isdisjoint({x["id"] for x in page2})
    assert client.get("/api/v1/roadmap?limit=0", headers=auth_headers).status_code == 422
    assert client.get("/api/v1/roadmap?limit=501", headers=auth_headers).status_code == 422


def test_author_cannot_edit_after_status_change(client, user, auth_headers, db):
    item = _item(db, status="planned", club_id=user.club_id, created_by_user_id=user.id)
    r = client.patch(f"/api/v1/roadmap/items/{item.id}", json={"title": "Neu"}, headers=auth_headers)
    assert r.status_code == 403


def test_delete_removes_comments(client, user, auth_headers, db):
    item = _item(db, club_id=user.club_id, created_by_user_id=user.id)
    db.add(Comment(parent_type="roadmap", parent_id=item.id, text="Hallo", created_by=user.id))
    db.commit()
    assert client.delete(f"/api/v1/roadmap/items/{item.id}", headers=auth_headers).status_code == 200
    assert db.query(Comment).filter(Comment.parent_type == "roadmap", Comment.parent_id == item.id).count() == 0


def test_status_change_notifies_author(client, user, admin, db, monkeypatch):
    calls = []
    monkeypatch.setattr(roadmap_api, "push_to_user", lambda db_, uid, title, body, url, category="", **kw: calls.append((uid, body, url, category)))
    item = _item(db, club_id=user.club_id, created_by_user_id=user.id, title="Bier")
    h = _headers(admin)
    assert client.patch(f"/api/v1/roadmap/items/{item.id}", json={"status": "planned"}, headers=h).status_code == 200
    assert calls and calls[0][0] == user.id and "Geplant" in calls[0][1] and calls[0][3] == "roadmap"
    # pinning alone does not notify; a new admin note does
    n = len(calls)
    client.patch(f"/api/v1/roadmap/items/{item.id}", json={"is_pinned": True}, headers=h)
    assert len(calls) == n
    client.patch(f"/api/v1/roadmap/items/{item.id}", json={"admin_notes": "Kommt bald"}, headers=h)
    assert len(calls) == n + 1


def test_own_status_change_does_not_notify_self(client, admin, db, monkeypatch):
    calls = []
    monkeypatch.setattr(roadmap_api, "push_to_user", lambda *a, **k: calls.append(a))
    item = _item(db, club_id=admin.club_id, created_by_user_id=admin.id)
    client.patch(f"/api/v1/roadmap/items/{item.id}", json={"status": "planned"}, headers=_headers(admin))
    assert calls == []


def test_completing_stamps_deployed_version(client, admin, db):
    from api.v1.roadmap import _deployed_version

    item = _item(db, club_id=admin.club_id, created_by_user_id=admin.id, status="planned", target_version="2.0")
    r = client.patch(f"/api/v1/roadmap/items/{item.id}", json={"status": "completed", "target_version": "2.0"}, headers=_headers(admin))
    assert r.status_code == 200
    assert r.json()["target_version"] == _deployed_version()


def test_completing_keeps_explicit_version(client, admin, db):
    item = _item(db, club_id=admin.club_id, created_by_user_id=admin.id, status="planned", target_version="2.0")
    r = client.patch(f"/api/v1/roadmap/items/{item.id}", json={"status": "completed", "target_version": "1.50"}, headers=_headers(admin))
    assert r.json()["target_version"] == "1.50"

"""Tests for the sticker wall: /stickers CRUD and its comment/reaction parent type."""
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.comment import Comment
from models.sticker import Sticker
from models.user import User, UserRole

URL = "/api/v1/stickers/"


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    db.query(Comment).filter(Comment.parent_type == "sticker").delete(synchronize_session=False)
    db.query(Sticker).delete(synchronize_session=False)
    db.commit()


def _media(club: Club, name: str = "a") -> str:
    return f"/uploads/media/media_{club.id}_{name}.jpg"


def _body(club: Club, **over) -> dict:
    b = {"media_url": _media(club), "place_name": "Mallorca", "latitude": 39.6, "longitude": 2.9}
    b.update(over)
    return b


def _headers(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


@pytest.fixture()
def admin(db: Session, club: Club):
    u = User(email="adm@test.de", name="Admin", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    return u


def test_requires_auth(client: TestClient):
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={}).status_code == 401


def test_create_and_list(client: TestClient, auth_headers, club: Club):
    r = client.post(URL, json=_body(club, caption=" Hello ", stuck_on="2025-07-01"), headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["place_name"] == "Mallorca"
    assert body["caption"] == "Hello"
    assert body["stuck_on"] == "2025-07-01"
    assert body["can_edit"] is True
    assert body["created_by_name"] == "Test Member"
    lst = client.get(URL, headers=auth_headers).json()
    assert [s["id"] for s in lst] == [body["id"]]


def test_list_sorted_by_stuck_on_desc(client: TestClient, auth_headers, club: Club):
    old = client.post(URL, json=_body(club, stuck_on="2020-01-01"), headers=auth_headers).json()
    new = client.post(URL, json=_body(club, stuck_on="2024-01-01"), headers=auth_headers).json()
    assert [s["id"] for s in client.get(URL, headers=auth_headers).json()] == [new["id"], old["id"]]


@pytest.mark.parametrize("over", [
    {"latitude": 91}, {"longitude": -181}, {"place_name": ""}, {"place_name": "x" * 121},
    {"stuck_on": "nope"}, {"media_url": "https://evil.example/x.jpg"},
    {"media_url": "/uploads/media/media_999999_a.jpg"},
])
def test_create_validation(client: TestClient, auth_headers, club: Club, over):
    assert client.post(URL, json=_body(club, **over), headers=auth_headers).status_code in (400, 422)


def test_future_date_rejected(client: TestClient, auth_headers, club: Club):
    d = (date.today() + timedelta(days=3)).isoformat()
    assert client.post(URL, json=_body(club, stuck_on=d), headers=auth_headers).status_code == 400


def test_update_by_author(client: TestClient, auth_headers, club: Club):
    sid = client.post(URL, json=_body(club, stuck_on="2024-01-01"), headers=auth_headers).json()["id"]
    r = client.patch(f"{URL}{sid}", json={"place_name": "Lisbon", "latitude": 38.7, "longitude": -9.1,
                                          "stuck_on": ""}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["place_name"] == "Lisbon"
    assert r.json()["stuck_on"] is None


def test_update_needs_both_coordinates(client: TestClient, auth_headers, club: Club):
    sid = client.post(URL, json=_body(club), headers=auth_headers).json()["id"]
    assert client.patch(f"{URL}{sid}", json={"latitude": 10}, headers=auth_headers).status_code == 400


def test_rejected_update_changes_nothing(client: TestClient, auth_headers, club: Club):
    sid = client.post(URL, json=_body(club), headers=auth_headers).json()["id"]
    r = client.patch(f"{URL}{sid}", json={"place_name": "Changed", "stuck_on": "bad"}, headers=auth_headers)
    assert r.status_code == 400
    assert client.get(URL, headers=auth_headers).json()[0]["place_name"] == "Mallorca"


def test_other_member_cannot_edit_or_delete(client: TestClient, auth_headers, club: Club, second_user):
    sid = client.post(URL, json=_body(club), headers=auth_headers).json()["id"]
    h2 = _headers(second_user)
    assert client.patch(f"{URL}{sid}", json={"caption": "x"}, headers=h2).status_code == 403
    assert client.delete(f"{URL}{sid}", headers=h2).status_code == 403
    assert client.get(URL, headers=h2).json()[0]["can_edit"] is False


def test_admin_can_edit_and_delete(client: TestClient, auth_headers, club: Club, admin):
    sid = client.post(URL, json=_body(club), headers=auth_headers).json()["id"]
    ha = _headers(admin)
    assert client.patch(f"{URL}{sid}", json={"caption": "x"}, headers=ha).status_code == 200
    assert client.delete(f"{URL}{sid}", headers=ha).status_code == 204
    assert client.get(URL, headers=ha).json() == []


def test_delete_missing_404(client: TestClient, auth_headers):
    assert client.delete(f"{URL}9999", headers=auth_headers).status_code == 404


def test_club_isolation(client: TestClient, auth_headers, club: Club, db: Session):
    sid = client.post(URL, json=_body(club), headers=auth_headers).json()["id"]
    other = Club(name="Other", slug="other-club")
    db.add(other)
    db.commit()
    u = User(email="o@test.de", name="O", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=other.id, is_active=True)
    db.add(u)
    db.commit()
    try:
        h = _headers(u)
        assert client.get(URL, headers=h).json() == []
        assert client.delete(f"{URL}{sid}", headers=h).status_code == 404
        assert client.get(f"/api/v1/comments/sticker/{sid}", headers=h).status_code == 404
    finally:
        db.delete(u)
        db.delete(other)
        db.commit()


def test_comments_on_sticker(client: TestClient, auth_headers, club: Club):
    sid = client.post(URL, json=_body(club), headers=auth_headers).json()["id"]
    r = client.post(f"/api/v1/comments/sticker/{sid}", json={"text": "Nice!"}, headers=auth_headers)
    assert r.status_code == 200, r.text
    assert len(client.get(f"/api/v1/comments/sticker/{sid}", headers=auth_headers).json()) == 1
    r = client.post(f"/api/v1/comments/item-reaction/sticker/{sid}", json={"emoji": "❤️"}, headers=auth_headers)
    assert r.status_code == 200, r.text


def test_create_notifies_opt_in_category_without_author(client: TestClient, auth_headers, club: Club, user: User):
    with patch("api.v1.stickers.push_to_club") as notify:
        r = client.post(URL, json=_body(club, place_name="Rom"), headers=auth_headers)
    assert r.status_code == 200
    args, kwargs = notify.call_args
    assert args[1] == club.id
    assert "Rom" in args[3]
    assert args[4] == f"/#stickers?item={r.json()['id']}"
    assert kwargs["category"] == "stickers"
    assert kwargs["exclude_user_id"] == user.id


def test_stickers_notifications_default_off():
    from core.push import category_default
    assert category_default("stickers") == ()


def test_stickers_preference_round_trips(client: TestClient, auth_headers):
    r = client.patch("/api/v1/push/preferences", json={"stickers": ["push"]}, headers=auth_headers)
    assert r.status_code == 200
    prefs = client.get("/api/v1/push/preferences", headers=auth_headers).json()
    assert prefs["stickers"] == ["push"]


def test_multiple_photos_keep_order_and_cover(client: TestClient, auth_headers, club: Club):
    urls = [_media(club, "a"), _media(club, "b"), _media(club, "c")]
    body = _body(club)
    body.pop("media_url")
    r = client.post(URL, json={**body, "media_urls": urls}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["media_url"] == urls[0]
    assert r.json()["media_urls"] == urls


def test_single_media_url_still_works(client: TestClient, auth_headers, club: Club):
    r = client.post(URL, json=_body(club), headers=auth_headers)
    assert r.json()["media_urls"] == [_media(club)]


def test_photo_required_and_limited(client: TestClient, auth_headers, club: Club):
    body = _body(club)
    body.pop("media_url")
    assert client.post(URL, json=body, headers=auth_headers).status_code == 400
    many = [_media(club, str(i)) for i in range(11)]
    assert client.post(URL, json={**body, "media_urls": many}, headers=auth_headers).status_code == 400
    bad = [_media(club, "a"), "https://evil.example/x.jpg"]
    assert client.post(URL, json={**body, "media_urls": bad}, headers=auth_headers).status_code == 400


def test_update_replaces_photo_list(client: TestClient, auth_headers, club: Club):
    sid = client.post(URL, json=_body(club), headers=auth_headers).json()["id"]
    new = [_media(club, "x"), _media(club, "y")]
    r = client.patch(f"{URL}{sid}", json={"media_urls": new}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["media_urls"] == new
    r = client.patch(f"{URL}{sid}", json={"media_urls": [_media(club, "z")]}, headers=auth_headers)
    assert r.json()["media_urls"] == [_media(club, "z")]

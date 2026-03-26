"""Tests for comment and emoji-reaction endpoints."""
import pytest
from datetime import datetime, UTC
from fastapi.testclient import TestClient

from core.security import create_access_token, get_password_hash
from models.comment import Comment, CommentReaction
from models.committee import ClubAnnouncement
from models.evening import Evening, EveningHighlight
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Local fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def admin_user(db, club):
    u = User(
        email="commentadmin@test.de",
        name="Comment Admin",
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
def second_user(db, club):
    u = User(
        email="commentmember2@test.de",
        name="Second Member",
        hashed_password=get_password_hash("testpass"),
        role=UserRole.member,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def second_headers(second_user):
    token = create_access_token({"sub": str(second_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def evening(db, club, admin_user):
    e = Evening(
        club_id=club.id,
        created_by=admin_user.id,
        date=datetime(2025, 6, 15, 20, 0, 0, tzinfo=UTC),
        venue="Testgaststätte",
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@pytest.fixture()
def highlight(db, evening, user):
    h = EveningHighlight(evening_id=evening.id, text="Schuh geworfen!", created_by=user.id)
    db.add(h)
    db.commit()
    db.refresh(h)
    return h


@pytest.fixture()
def announcement(db, club, admin_user):
    a = ClubAnnouncement(
        club_id=club.id,
        title="Testankündigung",
        text="Das ist ein Test.",
        created_by=admin_user.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@pytest.fixture(autouse=True)
def cleanup(db, club):
    yield
    from models.comment import ItemReaction
    from sqlalchemy import select
    # FK order: item reactions → comment reactions → comments → highlights → evenings → announcements
    db.query(ItemReaction).delete(synchronize_session=False)
    comment_ids = db.scalars(select(Comment.id)).all()
    db.query(CommentReaction).filter(CommentReaction.comment_id.in_(comment_ids)).delete(
        synchronize_session=False
    )
    db.query(Comment).filter(Comment.id.in_(comment_ids)).delete(synchronize_session=False)
    evening_ids = [
        e.id for e in db.query(Evening).filter(Evening.club_id == club.id).all()
    ]
    db.query(EveningHighlight).filter(
        EveningHighlight.evening_id.in_(evening_ids)
    ).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubAnnouncement).filter(ClubAnnouncement.club_id == club.id).delete(
        synchronize_session=False
    )
    db.commit()


# ---------------------------------------------------------------------------
# GET /api/v1/comments/{parent_type}/{parent_id}
# ---------------------------------------------------------------------------

class TestListComments:
    def test_empty_for_new_highlight(self, client: TestClient, auth_headers, highlight):
        resp = client.get(f"/api/v1/comments/highlight/{highlight.id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_empty_for_new_announcement(self, client: TestClient, auth_headers, announcement):
        resp = client.get(f"/api/v1/comments/announcement/{announcement.id}", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_comment_on_highlight(self, client: TestClient, db, auth_headers, user, highlight):
        c = Comment(parent_type="highlight", parent_id=highlight.id, text="Top!", created_by=user.id)
        db.add(c)
        db.commit()
        resp = client.get(f"/api/v1/comments/highlight/{highlight.id}", headers=auth_headers)
        data = resp.json()
        assert len(data) == 1
        assert data[0]["text"] == "Top!"
        assert data[0]["created_by_name"] is not None
        assert data[0]["reactions"] == []

    def test_returns_comment_on_announcement(self, client: TestClient, db, auth_headers, user, announcement):
        c = Comment(parent_type="announcement", parent_id=announcement.id, text="👍", created_by=user.id)
        db.add(c)
        db.commit()
        resp = client.get(f"/api/v1/comments/announcement/{announcement.id}", headers=auth_headers)
        data = resp.json()
        assert len(data) == 1
        assert data[0]["text"] == "👍"

    def test_requires_auth(self, client: TestClient, highlight):
        resp = client.get(f"/api/v1/comments/highlight/{highlight.id}")
        assert resp.status_code == 401

    def test_invalid_parent_type_returns_400(self, client: TestClient, auth_headers):
        resp = client.get("/api/v1/comments/game/999", headers=auth_headers)
        assert resp.status_code == 400

    def test_nonexistent_highlight_returns_404(self, client: TestClient, auth_headers):
        resp = client.get("/api/v1/comments/highlight/99999", headers=auth_headers)
        assert resp.status_code == 404

    def test_nonexistent_announcement_returns_404(self, client: TestClient, auth_headers):
        resp = client.get("/api/v1/comments/announcement/99999", headers=auth_headers)
        assert resp.status_code == 404

    def test_does_not_return_deleted_comments(self, client: TestClient, db, auth_headers, user, highlight):
        c = Comment(parent_type="highlight", parent_id=highlight.id, text="Deleted!", created_by=user.id, is_deleted=True)
        db.add(c)
        db.commit()
        resp = client.get(f"/api/v1/comments/highlight/{highlight.id}", headers=auth_headers)
        assert resp.json() == []


# ---------------------------------------------------------------------------
# POST /api/v1/comments/{parent_type}/{parent_id}
# ---------------------------------------------------------------------------

class TestCreateComment:
    def test_member_can_comment_on_highlight(self, client: TestClient, auth_headers, highlight):
        resp = client.post(
            f"/api/v1/comments/highlight/{highlight.id}",
            json={"text": "Genial!"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Genial!"
        assert data["created_by_id"] is not None
        assert data["reactions"] == []

    def test_member_can_comment_on_announcement(self, client: TestClient, auth_headers, announcement):
        resp = client.post(
            f"/api/v1/comments/announcement/{announcement.id}",
            json={"text": "Interessant!"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["text"] == "Interessant!"

    def test_requires_auth(self, client: TestClient, highlight):
        resp = client.post(f"/api/v1/comments/highlight/{highlight.id}", json={"text": "X"})
        assert resp.status_code == 401

    def test_empty_text_returns_400(self, client: TestClient, auth_headers, highlight):
        resp = client.post(
            f"/api/v1/comments/highlight/{highlight.id}",
            json={"text": "   "},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_invalid_parent_type_returns_400(self, client: TestClient, auth_headers):
        resp = client.post("/api/v1/comments/game/1", json={"text": "X"}, headers=auth_headers)
        assert resp.status_code == 400

    def test_nonexistent_parent_returns_404(self, client: TestClient, auth_headers):
        resp = client.post("/api/v1/comments/highlight/99999", json={"text": "X"}, headers=auth_headers)
        assert resp.status_code == 404

    def test_strips_whitespace(self, client: TestClient, auth_headers, highlight):
        resp = client.post(
            f"/api/v1/comments/highlight/{highlight.id}",
            json={"text": "  Hallo Welt  "},
            headers=auth_headers,
        )
        assert resp.json()["text"] == "Hallo Welt"


# ---------------------------------------------------------------------------
# DELETE /api/v1/comments/{comment_id}
# ---------------------------------------------------------------------------

class TestDeleteComment:
    def _make_comment(self, db, user, highlight, text="Zu löschen"):
        c = Comment(parent_type="highlight", parent_id=highlight.id, text=text, created_by=user.id)
        db.add(c)
        db.commit()
        db.refresh(c)
        return c

    def test_owner_can_delete(self, client: TestClient, db, auth_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.delete(f"/api/v1/comments/{c.id}", headers=auth_headers)
        assert resp.status_code == 204
        db.refresh(c)
        assert c.is_deleted is True

    def test_admin_can_delete_others_comment(self, client: TestClient, db, admin_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.delete(f"/api/v1/comments/{c.id}", headers=admin_headers)
        assert resp.status_code == 204

    def test_other_member_cannot_delete(self, client: TestClient, db, second_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.delete(f"/api/v1/comments/{c.id}", headers=second_headers)
        assert resp.status_code == 403

    def test_requires_auth(self, client: TestClient, db, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.delete(f"/api/v1/comments/{c.id}")
        assert resp.status_code == 401

    def test_nonexistent_returns_404(self, client: TestClient, auth_headers):
        resp = client.delete("/api/v1/comments/99999", headers=auth_headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/v1/comments/{comment_id}/reactions
# ---------------------------------------------------------------------------

class TestToggleReaction:
    def _make_comment(self, db, user, highlight):
        c = Comment(parent_type="highlight", parent_id=highlight.id, text="Reaktionstest", created_by=user.id)
        db.add(c)
        db.commit()
        db.refresh(c)
        return c

    def test_add_reaction(self, client: TestClient, db, auth_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.post(f"/api/v1/comments/{c.id}/reactions", json={"emoji": "👍"}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["action"] == "added"

    def test_remove_reaction_on_second_toggle(self, client: TestClient, db, auth_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        # Add first
        client.post(f"/api/v1/comments/{c.id}/reactions", json={"emoji": "❤️"}, headers=auth_headers)
        # Toggle off
        resp = client.post(f"/api/v1/comments/{c.id}/reactions", json={"emoji": "❤️"}, headers=auth_headers)
        assert resp.status_code == 200
        assert resp.json()["action"] == "removed"

    def test_reaction_appears_in_comment_list(self, client: TestClient, db, auth_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        client.post(f"/api/v1/comments/{c.id}/reactions", json={"emoji": "🎳"}, headers=auth_headers)
        resp = client.get(f"/api/v1/comments/highlight/{highlight.id}", headers=auth_headers)
        reactions = resp.json()[0]["reactions"]
        assert any(r["emoji"] == "🎳" and r["count"] == 1 and r["reacted_by_me"] is True for r in reactions)

    def test_reaction_not_by_me_flag(self, client: TestClient, db, auth_headers, second_headers, user, second_user, highlight):
        c = self._make_comment(db, user, highlight)
        # user 1 reacts
        client.post(f"/api/v1/comments/{c.id}/reactions", json={"emoji": "😂"}, headers=auth_headers)
        # user 2 fetches: reacted_by_me should be False
        resp = client.get(f"/api/v1/comments/highlight/{highlight.id}", headers=second_headers)
        reactions = resp.json()[0]["reactions"]
        assert any(r["emoji"] == "😂" and r["reacted_by_me"] is False for r in reactions)

    def test_requires_auth(self, client: TestClient, db, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.post(f"/api/v1/comments/{c.id}/reactions", json={"emoji": "👍"})
        assert resp.status_code == 401

    def test_nonexistent_comment_returns_404(self, client: TestClient, auth_headers):
        resp = client.post("/api/v1/comments/99999/reactions", json={"emoji": "👍"}, headers=auth_headers)
        assert resp.status_code == 404

    def test_different_emojis_coexist(self, client: TestClient, db, auth_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        client.post(f"/api/v1/comments/{c.id}/reactions", json={"emoji": "👍"}, headers=auth_headers)
        client.post(f"/api/v1/comments/{c.id}/reactions", json={"emoji": "❤️"}, headers=auth_headers)
        resp = client.get(f"/api/v1/comments/highlight/{highlight.id}", headers=auth_headers)
        reactions = resp.json()[0]["reactions"]
        emojis = {r["emoji"] for r in reactions}
        assert "👍" in emojis
        assert "❤️" in emojis


# ---------------------------------------------------------------------------
# PATCH /api/v1/comments/{comment_id}  — edit comment
# ---------------------------------------------------------------------------

class TestEditComment:
    def _make_comment(self, db, user, highlight):
        c = Comment(parent_type="highlight", parent_id=highlight.id, text="Original", created_by=user.id)
        db.add(c)
        db.commit()
        db.refresh(c)
        return c

    def test_author_can_edit(self, client: TestClient, db, auth_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.patch(f"/api/v1/comments/{c.id}", json={"text": "Edited!"}, headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "Edited!"
        assert data["edited_at"] is not None

    def test_non_author_cannot_edit(self, client: TestClient, db, second_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.patch(f"/api/v1/comments/{c.id}", json={"text": "Hijack"}, headers=second_headers)
        assert resp.status_code == 403

    def test_edit_nonexistent_returns_404(self, client: TestClient, auth_headers):
        resp = client.patch("/api/v1/comments/99999", json={"text": "X"}, headers=auth_headers)
        assert resp.status_code == 404

    def test_empty_text_returns_400(self, client: TestClient, db, auth_headers, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.patch(f"/api/v1/comments/{c.id}", json={"text": "   "}, headers=auth_headers)
        assert resp.status_code == 400

    def test_requires_auth(self, client: TestClient, db, user, highlight):
        c = self._make_comment(db, user, highlight)
        resp = client.patch(f"/api/v1/comments/{c.id}", json={"text": "X"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/v1/comments/item-reaction/{parent_type}/{parent_id}
# ---------------------------------------------------------------------------

class TestToggleItemReaction:
    def test_add_reaction_to_highlight(self, client: TestClient, auth_headers, highlight):
        resp = client.post(
            f"/api/v1/comments/item-reaction/highlight/{highlight.id}",
            json={"emoji": "❤️"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["action"] == "added"
        assert any(r["emoji"] == "❤️" for r in data["reactions"])

    def test_toggle_removes_existing_reaction(self, client: TestClient, auth_headers, highlight):
        client.post(
            f"/api/v1/comments/item-reaction/highlight/{highlight.id}",
            json={"emoji": "❤️"},
            headers=auth_headers,
        )
        resp = client.post(
            f"/api/v1/comments/item-reaction/highlight/{highlight.id}",
            json={"emoji": "❤️"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "removed"

    def test_add_reaction_to_announcement(self, client: TestClient, auth_headers, announcement):
        resp = client.post(
            f"/api/v1/comments/item-reaction/announcement/{announcement.id}",
            json={"emoji": "👍"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["action"] == "added"

    def test_invalid_parent_type_returns_400(self, client: TestClient, auth_headers):
        resp = client.post(
            "/api/v1/comments/item-reaction/game/1",
            json={"emoji": "❤️"},
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_nonexistent_parent_returns_404(self, client: TestClient, auth_headers):
        resp = client.post(
            "/api/v1/comments/item-reaction/highlight/99999",
            json={"emoji": "❤️"},
            headers=auth_headers,
        )
        assert resp.status_code == 404

    def test_requires_auth(self, client: TestClient, highlight):
        resp = client.post(
            f"/api/v1/comments/item-reaction/highlight/{highlight.id}",
            json={"emoji": "❤️"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/v1/comments/item-reactions/{parent_type}/{parent_id}
# ---------------------------------------------------------------------------

class TestGetItemReactions:
    def test_empty_by_default(self, client: TestClient, auth_headers, highlight):
        resp = client.get(
            f"/api/v1/comments/item-reactions/highlight/{highlight.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_added_reaction(self, client: TestClient, auth_headers, highlight):
        client.post(
            f"/api/v1/comments/item-reaction/highlight/{highlight.id}",
            json={"emoji": "❤️"},
            headers=auth_headers,
        )
        resp = client.get(
            f"/api/v1/comments/item-reactions/highlight/{highlight.id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any(r["emoji"] == "❤️" for r in data)

    def test_invalid_parent_type_returns_400(self, client: TestClient, auth_headers):
        resp = client.get(
            "/api/v1/comments/item-reactions/game/1",
            headers=auth_headers,
        )
        assert resp.status_code == 400

    def test_requires_auth(self, client: TestClient, highlight):
        resp = client.get(f"/api/v1/comments/item-reactions/highlight/{highlight.id}")
        assert resp.status_code == 401

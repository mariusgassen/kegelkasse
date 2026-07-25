"""
Tests for the club-wide mini-bowling leaderboard:
  GET  /bowling/leaderboard  — top-10 scores for the caller's club
  POST /bowling/scores       — submit a finished game's score
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.bowling import BowlingScore
from models.club import Club
from models.evening import RegularMember
from models.user import User, UserRole


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    db.query(BowlingScore).filter(BowlingScore.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


def _headers(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


# ── auth guards ────────────────────────────────────────────────────────────────

def test_leaderboard_requires_auth(client: TestClient):
    assert client.get("/api/v1/bowling/leaderboard").status_code == 401


def test_submit_requires_auth(client: TestClient):
    assert client.post("/api/v1/bowling/scores", json={"score": 5}).status_code == 401


# ── happy path ───────────────────────────────────────────────────────────────

def test_empty_leaderboard(client: TestClient, auth_headers):
    r = client.get("/api/v1/bowling/leaderboard", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


def test_submit_creates_record(client: TestClient, auth_headers, db: Session, club: Club):
    r = client.post("/api/v1/bowling/scores", json={"score": 12}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["is_record"] is True
    assert body["rank"] == 1
    assert len(body["leaderboard"]) == 1
    assert body["leaderboard"][0]["score"] == 12
    assert body["leaderboard"][0]["is_me"] is True
    assert db.query(BowlingScore).filter(BowlingScore.club_id == club.id).count() == 1


def test_leaderboard_orders_by_score_desc(client: TestClient, auth_headers):
    for s in (5, 20, 11):
        client.post("/api/v1/bowling/scores", json={"score": s}, headers=auth_headers)
    board = client.get("/api/v1/bowling/leaderboard", headers=auth_headers).json()
    assert [e["score"] for e in board] == [20, 11, 5]
    assert [e["rank"] for e in board] == [1, 2, 3]


def test_leaderboard_capped_at_ten(client: TestClient, auth_headers):
    for s in range(1, 15):
        client.post("/api/v1/bowling/scores", json={"score": s}, headers=auth_headers)
    board = client.get("/api/v1/bowling/leaderboard", headers=auth_headers).json()
    assert len(board) == 10
    assert board[0]["score"] == 14
    assert board[-1]["score"] == 5


def test_not_a_record_when_lower(client: TestClient, auth_headers):
    client.post("/api/v1/bowling/scores", json={"score": 20}, headers=auth_headers)
    r = client.post("/api/v1/bowling/scores", json={"score": 8}, headers=auth_headers)
    body = r.json()
    assert body["is_record"] is False
    assert body["rank"] == 2


def test_uses_nickname_as_display_name(client: TestClient, db: Session, club: Club):
    rm = RegularMember(club_id=club.id, name="Wilhelm Müller", nickname="Willi")
    db.add(rm)
    db.commit()
    db.refresh(rm)
    u = User(
        email="willi@test.de", name="Wilhelm Müller",
        hashed_password=get_password_hash("x"), role=UserRole.member,
        club_id=club.id, is_active=True, regular_member_id=rm.id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    board = client.post("/api/v1/bowling/scores", json={"score": 9}, headers=_headers(u)).json()["leaderboard"]
    assert board[0]["player_name"] == "Willi"
    db.query(User).filter(User.id == u.id).delete(synchronize_session=False)
    db.commit()


def test_rejects_negative_score(client: TestClient, auth_headers):
    assert client.post("/api/v1/bowling/scores", json={"score": -1}, headers=auth_headers).status_code == 400


def test_rejects_score_above_max(client: TestClient, auth_headers):
    assert client.post("/api/v1/bowling/scores", json={"score": 28}, headers=auth_headers).status_code == 400


def test_score_isolated_per_club(client: TestClient, auth_headers, db: Session):
    other = Club(name="Other Club", slug="other-club")
    db.add(other)
    db.commit()
    db.refresh(other)
    other_user = User(
        email="other@test.de", name="Other", hashed_password=get_password_hash("x"),
        role=UserRole.member, club_id=other.id, is_active=True,
    )
    db.add(other_user)
    db.commit()
    db.refresh(other_user)
    client.post("/api/v1/bowling/scores", json={"score": 25}, headers=_headers(other_user))

    board = client.get("/api/v1/bowling/leaderboard", headers=auth_headers).json()
    assert board == []  # the other club's score is not visible

    db.query(BowlingScore).filter(BowlingScore.club_id == other.id).delete(synchronize_session=False)
    db.query(User).filter(User.id == other_user.id).delete(synchronize_session=False)
    db.delete(other)
    db.commit()

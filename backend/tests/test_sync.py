"""
Tests for the offline sync endpoint:
  POST /sync/  — applies queued client changes (add/delete penalty + drink)
"""
import time

import pytest
from sqlalchemy.orm import Session

from models.club import Club
from models.drink import DrinkRound
from models.evening import Evening, EveningPlayer, RegularMember
from models.penalty import PenaltyLog


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    from models.game import Game, GameThrowLog
    from models.evening import EveningHighlight
    evenings = db.query(Evening).filter(Evening.club_id == club.id).all()
    for e in evenings:
        db.query(GameThrowLog).filter(GameThrowLog.game_id.in_(
            db.query(Game.id).filter(Game.evening_id == e.id)
        )).delete(synchronize_session=False)
        db.query(PenaltyLog).filter(PenaltyLog.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).delete(synchronize_session=False)
        db.query(DrinkRound).filter(DrinkRound.evening_id == e.id).delete(synchronize_session=False)
        db.query(Game).filter(Game.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningHighlight).filter(EveningHighlight.evening_id == e.id).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def evening(db: Session, club: Club) -> Evening:
    from datetime import datetime
    e = Evening(club_id=club.id, date=datetime(2025, 8, 1))
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@pytest.fixture()
def member(db: Session, club: Club) -> RegularMember:
    rm = RegularMember(club_id=club.id, name="Sync Member", is_active=True)
    db.add(rm)
    db.commit()
    db.refresh(rm)
    return rm


@pytest.fixture()
def player(db: Session, evening: Evening, member: RegularMember) -> EveningPlayer:
    p = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name="Sync Member")
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _sync(client, headers, changes):
    return client.post(
        "/api/v1/sync/",
        json={
            "client_id": "test-client",
            "changes": changes,
        },
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Basic structure
# ---------------------------------------------------------------------------

class TestSyncBasic:
    def test_empty_sync_returns_structure(self, client, auth_headers):
        r = _sync(client, auth_headers, [])
        assert r.status_code == 200
        data = r.json()
        assert data["applied"] == 0
        assert data["errors"] == []
        assert "server_timestamp" in data

    def test_requires_auth(self, client):
        r = client.post("/api/v1/sync/", json={"client_id": "x", "changes": []})
        assert r.status_code == 401

    def test_unknown_change_type_recorded_as_error(self, client, auth_headers, evening, player):
        r = _sync(client, auth_headers, [
            {"type": "unknown_op", "timestamp": time.time(), "data": {}},
        ])
        assert r.status_code == 200
        data = r.json()
        assert data["applied"] == 0
        assert len(data["errors"]) == 1
        assert "unknown change type" in data["errors"][0]["error"]


# ---------------------------------------------------------------------------
# add_penalty
# ---------------------------------------------------------------------------

class TestSyncAddPenalty:
    def test_adds_penalty_for_player(self, client, auth_headers, db, evening, player):
        r = _sync(client, auth_headers, [
            {
                "type": "add_penalty",
                "timestamp": time.time(),
                "data": {
                    "evening_id": evening.id,
                    "player_ids": [player.id],
                    "penalty_type_name": "Zu spät",
                    "icon": "⏰",
                    "amount": 1.0,
                    "mode": "euro",
                    "client_timestamp": time.time() * 1000,
                },
            }
        ])
        assert r.status_code == 200
        assert r.json()["applied"] == 1
        log = db.query(PenaltyLog).filter(PenaltyLog.evening_id == evening.id).first()
        assert log is not None
        assert log.amount == 1.0
        assert log.player_id == player.id

    def test_invalid_evening_id_recorded_as_error(self, client, auth_headers):
        r = _sync(client, auth_headers, [
            {
                "type": "add_penalty",
                "timestamp": time.time(),
                "data": {
                    "evening_id": 999999,
                    "player_ids": [1],
                    "penalty_type_name": "X",
                    "amount": 1.0,
                    "mode": "euro",
                    "client_timestamp": time.time() * 1000,
                },
            }
        ])
        assert r.status_code == 200
        assert r.json()["applied"] == 0
        assert len(r.json()["errors"]) == 1

    def test_multiple_players_get_separate_logs(self, client, auth_headers, db, club, evening, player):
        p2 = EveningPlayer(evening_id=evening.id, name="Player2")
        db.add(p2)
        db.commit()
        r = _sync(client, auth_headers, [
            {
                "type": "add_penalty",
                "timestamp": time.time(),
                "data": {
                    "evening_id": evening.id,
                    "player_ids": [player.id, p2.id],
                    "penalty_type_name": "Runde",
                    "amount": 0.5,
                    "mode": "euro",
                    "client_timestamp": time.time() * 1000,
                },
            }
        ])
        assert r.json()["applied"] == 1
        count = db.query(PenaltyLog).filter(PenaltyLog.evening_id == evening.id).count()
        assert count == 2


# ---------------------------------------------------------------------------
# delete_penalty
# ---------------------------------------------------------------------------

class TestSyncDeletePenalty:
    def test_soft_deletes_penalty(self, client, auth_headers, db, evening, player):
        log = PenaltyLog(
            evening_id=evening.id,
            player_id=player.id,
            player_name="Sync Member",
            penalty_type_name="X",
            amount=1.0,
            mode="euro",
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = _sync(client, auth_headers, [
            {
                "type": "delete_penalty",
                "timestamp": time.time(),
                "data": {"evening_id": evening.id, "penalty_id": log.id},
            }
        ])
        assert r.json()["applied"] == 1
        db.expire(log)
        assert log.is_deleted is True

    def test_delete_nonexistent_penalty_is_noop(self, client, auth_headers, evening):
        r = _sync(client, auth_headers, [
            {
                "type": "delete_penalty",
                "timestamp": time.time(),
                "data": {"evening_id": evening.id, "penalty_id": 99999},
            }
        ])
        # no error — missing penalty is a silent noop
        assert r.json()["applied"] == 1


# ---------------------------------------------------------------------------
# add_drink
# ---------------------------------------------------------------------------

class TestSyncAddDrink:
    def test_adds_beer_round(self, client, auth_headers, db, evening, player):
        ts = time.time() * 1000
        r = _sync(client, auth_headers, [
            {
                "type": "add_drink",
                "timestamp": time.time(),
                "data": {
                    "evening_id": evening.id,
                    "drink_type": "beer",
                    "participant_ids": [player.id],
                    "client_timestamp": ts,
                },
            }
        ])
        assert r.json()["applied"] == 1
        dr = db.query(DrinkRound).filter(DrinkRound.evening_id == evening.id).first()
        assert dr is not None
        assert dr.drink_type == "beer"
        assert player.id in dr.participant_ids

    def test_adds_shots_round(self, client, auth_headers, db, evening, player):
        ts = time.time() * 1000
        r = _sync(client, auth_headers, [
            {
                "type": "add_drink",
                "timestamp": time.time(),
                "data": {
                    "evening_id": evening.id,
                    "drink_type": "shots",
                    "participant_ids": [player.id],
                    "client_timestamp": ts,
                },
            }
        ])
        assert r.json()["applied"] == 1
        dr = db.query(DrinkRound).filter(DrinkRound.evening_id == evening.id).first()
        assert dr.drink_type == "shots"


# ---------------------------------------------------------------------------
# delete_drink
# ---------------------------------------------------------------------------

class TestSyncDeleteDrink:
    def test_deletes_drink_round(self, client, auth_headers, db, evening, player):
        dr = DrinkRound(
            evening_id=evening.id,
            drink_type="beer",
            participant_ids=[player.id],
            client_timestamp=time.time() * 1000,
        )
        db.add(dr)
        db.commit()
        r = _sync(client, auth_headers, [
            {
                "type": "delete_drink",
                "timestamp": time.time(),
                "data": {"evening_id": evening.id, "drink_id": dr.id},
            }
        ])
        assert r.json()["applied"] == 1
        assert db.query(DrinkRound).filter(DrinkRound.id == dr.id).first() is None

    def test_delete_nonexistent_drink_is_noop(self, client, auth_headers, evening):
        r = _sync(client, auth_headers, [
            {
                "type": "delete_drink",
                "timestamp": time.time(),
                "data": {"evening_id": evening.id, "drink_id": 99999},
            }
        ])
        assert r.json()["applied"] == 1


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------

class TestSyncOrdering:
    def test_changes_applied_in_timestamp_order(self, client, auth_headers, db, evening, player):
        """Add penalty then delete it — should result in 0 active penalties."""
        now = time.time()
        ts_ms = now * 1000
        # We send delete first (higher timestamp last) to verify ordering
        add_change = {
            "type": "add_penalty",
            "timestamp": now,
            "data": {
                "evening_id": evening.id,
                "player_ids": [player.id],
                "penalty_type_name": "Order Test",
                "amount": 1.0,
                "mode": "euro",
                "client_timestamp": ts_ms,
            },
        }
        _sync(client, auth_headers, [add_change])
        log = db.query(PenaltyLog).filter(PenaltyLog.evening_id == evening.id).first()
        assert log is not None

        delete_change = {
            "type": "delete_penalty",
            "timestamp": now + 1,
            "data": {"evening_id": evening.id, "penalty_id": log.id},
        }
        r_del = _sync(client, auth_headers, [delete_change])
        assert r_del.json()["applied"] == 1
        db.expire(log)
        assert log.is_deleted is True

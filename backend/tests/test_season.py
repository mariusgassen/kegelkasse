"""
Tests for season-closing workflow endpoints:
  GET /season/snapshots         — list season snapshots
  GET /season/snapshots/{year}  — get snapshot by year
  POST /season/close            — perform season close
"""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.evening import Evening, EveningPlayer, RegularMember
from models.payment import MemberPayment
from models.penalty import PenaltyLog, PenaltyType
from models.season import SeasonSnapshot
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()  # recover from any error state before cleanup
    db.query(SeasonSnapshot).filter(SeasonSnapshot.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(
        MemberPayment.club_id == club.id,
    ).delete(synchronize_session=False)
    evenings = db.query(Evening).filter(Evening.club_id == club.id).all()
    for e in evenings:
        db.query(PenaltyLog).filter(PenaltyLog.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin_user(db: Session, club: Club) -> User:
    u = User(
        email="admin_season@test.de",
        name="Season Admin",
        hashed_password=get_password_hash("pass"),
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
def regular_member(db: Session, club: Club) -> RegularMember:
    rm = RegularMember(club_id=club.id, name="Regular Player", nickname="Reg", is_active=True)
    db.add(rm)
    db.commit()
    db.refresh(rm)
    return rm


@pytest.fixture()
def evening_2024(db: Session, club: Club) -> Evening:
    e = Evening(club_id=club.id, date=datetime(2024, 5, 10), is_closed=False)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@pytest.fixture()
def evening_2023(db: Session, club: Club) -> Evening:
    e = Evening(club_id=club.id, date=datetime(2023, 8, 20), is_closed=False)
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


# ---------------------------------------------------------------------------
# Tests — list snapshots
# ---------------------------------------------------------------------------

def test_list_snapshots_empty(client: TestClient, admin_headers: dict):
    res = client.get("/api/v1/season/snapshots", headers=admin_headers)
    assert res.status_code == 200
    assert res.json() == []


def test_list_snapshots_requires_auth(client: TestClient):
    res = client.get("/api/v1/season/snapshots")
    assert res.status_code in (401, 403)


def test_list_snapshots_after_close(client: TestClient, admin_headers: dict):
    res = client.post("/api/v1/season/close", json={"year": 2022}, headers=admin_headers)
    assert res.status_code == 201
    res2 = client.get("/api/v1/season/snapshots", headers=admin_headers)
    assert res2.status_code == 200
    data = res2.json()
    assert len(data) == 1
    assert data[0]["year"] == 2022


# ---------------------------------------------------------------------------
# Tests — get snapshot by year
# ---------------------------------------------------------------------------

def test_get_snapshot_by_year(client: TestClient, admin_headers: dict):
    client.post("/api/v1/season/close", json={"year": 2021}, headers=admin_headers)
    res = client.get("/api/v1/season/snapshots/2021", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["year"] == 2021


def test_get_snapshot_not_found(client: TestClient, admin_headers: dict):
    res = client.get("/api/v1/season/snapshots/9999", headers=admin_headers)
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Tests — close season
# ---------------------------------------------------------------------------

def test_close_season_success(client: TestClient, admin_headers: dict):
    res = client.post("/api/v1/season/close", json={"year": 2024}, headers=admin_headers)
    assert res.status_code == 201
    data = res.json()
    assert data["year"] == 2024
    assert "closed_at" in data
    assert data["ranking_data"] is not None


def test_close_season_closes_open_evenings(
    client: TestClient, admin_headers: dict, db: Session, club: Club, evening_2024: Evening
):
    assert evening_2024.is_closed is False
    client.post("/api/v1/season/close", json={"year": 2024}, headers=admin_headers)
    db.refresh(evening_2024)
    assert evening_2024.is_closed is True


def test_close_season_does_not_close_other_year_evenings(
    client: TestClient, admin_headers: dict, db: Session, club: Club, evening_2023: Evening
):
    client.post("/api/v1/season/close", json={"year": 2024}, headers=admin_headers)
    db.refresh(evening_2023)
    assert evening_2023.is_closed is False


def test_close_season_books_carry_over(
    client: TestClient, admin_headers: dict, db: Session, club: Club,
    regular_member: RegularMember,
):
    # Give member a penalty (debt) → balance will be negative → carry-over needed
    evening = Evening(club_id=club.id, date=datetime(2024, 3, 1), is_closed=True)
    db.add(evening)
    db.commit()
    db.refresh(evening)
    player = EveningPlayer(evening_id=evening.id, regular_member_id=regular_member.id, name=regular_member.name)
    db.add(player)
    db.commit()
    db.refresh(player)
    import time
    penalty = PenaltyLog(
        evening_id=evening.id, player_id=player.id, player_name=regular_member.name,
        penalty_type_name="Tesstrafe", amount=5.0, mode="euro", unit_amount=1.0,
        client_timestamp=time.time(),
    )
    db.add(penalty)
    db.commit()

    res = client.post("/api/v1/season/close", json={"year": 2024}, headers=admin_headers)
    assert res.status_code == 201
    data = res.json()
    assert data["carry_over_count"] >= 1

    payment = db.query(MemberPayment).filter(
        MemberPayment.regular_member_id == regular_member.id,
        MemberPayment.note.like("Jahresabschluss%"),
    ).first()
    assert payment is not None
    assert round(payment.amount, 2) == 5.0  # -balance = -(-5) = 5


def test_close_season_with_notes(client: TestClient, admin_headers: dict):
    res = client.post(
        "/api/v1/season/close",
        json={"year": 2020, "notes": "Last season notes"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    assert res.json()["notes"] == "Last season notes"


def test_close_season_duplicate(client: TestClient, admin_headers: dict):
    client.post("/api/v1/season/close", json={"year": 2019}, headers=admin_headers)
    res2 = client.post("/api/v1/season/close", json={"year": 2019}, headers=admin_headers)
    assert res2.status_code == 400
    assert "already been closed" in res2.json()["detail"]


def test_close_season_invalid_year(client: TestClient, admin_headers: dict):
    res = client.post("/api/v1/season/close", json={"year": 1999}, headers=admin_headers)
    assert res.status_code == 400


def test_close_season_unauthenticated(client: TestClient):
    res = client.post("/api/v1/season/close", json={"year": 2024})
    assert res.status_code in (401, 403)


def test_close_season_member_role_forbidden(client: TestClient, auth_headers: dict):
    res = client.post("/api/v1/season/close", json={"year": 2024}, headers=auth_headers)
    assert res.status_code == 403


def test_close_season_with_settle_member_ids(
    client: TestClient, admin_headers: dict, db: Session, club: Club,
    regular_member: RegularMember,
):
    """Only settle members explicitly listed in settle_member_ids."""
    # Give member a debt in 2024
    import time
    evening = Evening(club_id=club.id, date=datetime(2024, 3, 1), is_closed=True)
    db.add(evening)
    db.commit()
    db.refresh(evening)
    player = EveningPlayer(evening_id=evening.id, regular_member_id=regular_member.id, name=regular_member.name)
    db.add(player)
    db.commit()
    db.refresh(player)
    penalty = PenaltyLog(
        evening_id=evening.id, player_id=player.id, player_name=regular_member.name,
        penalty_type_name="Teststrafe", amount=5.0, mode="euro", unit_amount=1.0,
        client_timestamp=time.time(),
    )
    db.add(penalty)
    db.commit()

    # Close season but explicitly exclude this member from settlement
    res = client.post(
        "/api/v1/season/close",
        json={"year": 2024, "settle_member_ids": []},  # empty = settle nobody
        headers=admin_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["carry_over_count"] == 0  # nobody was settled

    # No carry-over payment created
    payment = db.query(MemberPayment).filter(
        MemberPayment.regular_member_id == regular_member.id,
        MemberPayment.note.like("Jahresabschluss%"),
    ).first()
    assert payment is None


# ---------------------------------------------------------------------------
# Tests — balance preview
# ---------------------------------------------------------------------------

def test_balance_preview_empty_year(client: TestClient, admin_headers: dict):
    """Year with no evenings/payments returns empty list."""
    res = client.get("/api/v1/season/balance-preview/2001", headers=admin_headers)
    assert res.status_code == 200
    assert res.json() == []


def test_balance_preview_with_debt(
    client: TestClient, admin_headers: dict, db: Session, club: Club,
    regular_member: RegularMember,
):
    """Year with a debt shows non-zero balances."""
    import time
    evening = Evening(club_id=club.id, date=datetime(2024, 6, 1), is_closed=True)
    db.add(evening)
    db.commit()
    db.refresh(evening)
    player = EveningPlayer(evening_id=evening.id, regular_member_id=regular_member.id, name=regular_member.name)
    db.add(player)
    db.commit()
    db.refresh(player)
    penalty = PenaltyLog(
        evening_id=evening.id, player_id=player.id, player_name=regular_member.name,
        penalty_type_name="Teststrafe", amount=3.0, mode="euro", unit_amount=1.0,
        client_timestamp=time.time(),
    )
    db.add(penalty)
    db.commit()

    res = client.get("/api/v1/season/balance-preview/2024", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    member_entry = next((b for b in data if b["regular_member_id"] == regular_member.id), None)
    assert member_entry is not None
    assert member_entry["balance"] == -3.0


def test_balance_preview_excludes_other_years(
    client: TestClient, admin_headers: dict, db: Session, club: Club,
    regular_member: RegularMember, evening_2023: Evening,
):
    """Previewing 2024 does not include debts from 2023."""
    import time
    player = EveningPlayer(evening_id=evening_2023.id, regular_member_id=regular_member.id, name=regular_member.name)
    db.add(player)
    db.commit()
    db.refresh(player)
    penalty = PenaltyLog(
        evening_id=evening_2023.id, player_id=player.id, player_name=regular_member.name,
        penalty_type_name="Teststrafe", amount=7.0, mode="euro", unit_amount=1.0,
        client_timestamp=time.time(),
    )
    db.add(penalty)
    db.commit()

    # Preview for 2024 — no evenings in 2024 — should be empty
    res = client.get("/api/v1/season/balance-preview/2024", headers=admin_headers)
    assert res.status_code == 200
    assert res.json() == []


def test_balance_preview_invalid_year(client: TestClient, admin_headers: dict):
    res = client.get("/api/v1/season/balance-preview/1999", headers=admin_headers)
    assert res.status_code == 400


def test_balance_preview_requires_admin(client: TestClient, auth_headers: dict):
    res = client.get("/api/v1/season/balance-preview/2024", headers=auth_headers)
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# Tests — reopen season
# ---------------------------------------------------------------------------

def test_reopen_season_deletes_snapshot(client: TestClient, admin_headers: dict):
    client.post("/api/v1/season/close", json={"year": 2018}, headers=admin_headers)
    res = client.delete("/api/v1/season/snapshots/2018", headers=admin_headers)
    assert res.status_code == 204
    # Snapshot gone
    res2 = client.get("/api/v1/season/snapshots/2018", headers=admin_headers)
    assert res2.status_code == 404


def test_reopen_season_reverses_carry_over(
    client: TestClient, admin_headers: dict, db: Session, club: Club,
    regular_member: RegularMember,
):
    """Reopening a season deletes the carry-over MemberPayment entries."""
    import time
    evening = Evening(club_id=club.id, date=datetime(2017, 4, 1), is_closed=True)
    db.add(evening)
    db.commit()
    db.refresh(evening)
    player = EveningPlayer(evening_id=evening.id, regular_member_id=regular_member.id, name=regular_member.name)
    db.add(player)
    db.commit()
    db.refresh(player)
    penalty = PenaltyLog(
        evening_id=evening.id, player_id=player.id, player_name=regular_member.name,
        penalty_type_name="Teststrafe", amount=4.0, mode="euro", unit_amount=1.0,
        client_timestamp=time.time(),
    )
    db.add(penalty)
    db.commit()

    client.post("/api/v1/season/close", json={"year": 2017}, headers=admin_headers)
    # Carry-over payment should exist, tagged with a transfer_group_id (not just the note text)
    payment = db.query(MemberPayment).filter(
        MemberPayment.regular_member_id == regular_member.id,
        MemberPayment.note == "Jahresabschluss 2017",
    ).first()
    assert payment is not None
    assert payment.transfer_group_id == f"season-close-{club.id}-2017"

    # Reopen
    res = client.delete("/api/v1/season/snapshots/2017", headers=admin_headers)
    assert res.status_code == 204

    db.expire_all()
    payment_after = db.query(MemberPayment).filter(
        MemberPayment.regular_member_id == regular_member.id,
        MemberPayment.note == "Jahresabschluss 2017",
    ).first()
    assert payment_after is None


def test_reopen_season_reverses_legacy_note_only_carry_over(
    client: TestClient, admin_headers: dict, db: Session, club: Club,
    regular_member: RegularMember,
):
    """Seasons closed before transfer_group_id existed are still reversible via the note-text fallback."""
    evening = Evening(club_id=club.id, date=datetime(2016, 4, 1), is_closed=True)
    db.add(evening)
    db.commit()
    db.refresh(evening)

    snap = SeasonSnapshot(club_id=club.id, year=2016, member_count=1, evening_count=1, carry_over_count=1)
    legacy_payment = MemberPayment(
        club_id=club.id, regular_member_id=regular_member.id, amount=-4.0,
        note="Jahresabschluss 2016",  # no transfer_group_id — simulates a pre-migration row
    )
    db.add_all([snap, legacy_payment])
    db.commit()

    res = client.delete("/api/v1/season/snapshots/2016", headers=admin_headers)
    assert res.status_code == 204

    db.expire_all()
    assert db.query(MemberPayment).filter(
        MemberPayment.regular_member_id == regular_member.id,
        MemberPayment.note == "Jahresabschluss 2016",
    ).first() is None


def test_reopen_season_not_found(client: TestClient, admin_headers: dict):
    res = client.delete("/api/v1/season/snapshots/9999", headers=admin_headers)
    assert res.status_code == 404


# ---------------------------------------------------------------------------
# Tests — guard: cannot create/start evening in a closed season
# ---------------------------------------------------------------------------

def test_create_evening_blocked_in_closed_season(
    client: TestClient, admin_headers: dict
):
    """POST /evening/ must return 400 when the date falls in a closed season year."""
    client.post("/api/v1/season/close", json={"year": 2015}, headers=admin_headers)
    res = client.post(
        "/api/v1/evening/",
        json={"date": "2015-06-01"},
        headers=admin_headers,
    )
    assert res.status_code == 400
    assert "2015" in res.json()["detail"]


def test_create_evening_allowed_in_open_season(
    client: TestClient, admin_headers: dict, db: Session, club: Club
):
    """POST /evening/ succeeds when no snapshot exists for the given year."""
    # Close 2014 only — 2016 should still be open
    client.post("/api/v1/season/close", json={"year": 2014}, headers=admin_headers)
    res = client.post(
        "/api/v1/evening/",
        json={"date": "2016-03-10"},
        headers=admin_headers,
    )
    assert res.status_code == 200


def test_start_evening_from_schedule_blocked_in_closed_season(
    client: TestClient, admin_headers: dict, db: Session, club: Club, admin_user: User
):
    """POST /schedule/{sid}/start must return 400 when the scheduled date is in a closed season."""
    from datetime import timezone
    from models.schedule import ScheduledEvening

    se = ScheduledEvening(
        club_id=club.id,
        scheduled_at=datetime(2013, 9, 5, 20, 0, 0, tzinfo=timezone.utc),
        venue="Testgasse",
        created_by=admin_user.id,
    )
    db.add(se)
    db.commit()
    db.refresh(se)

    client.post("/api/v1/season/close", json={"year": 2013}, headers=admin_headers)

    res = client.post(f"/api/v1/schedule/{se.id}/start", json={"member_ids": []}, headers=admin_headers)
    assert res.status_code == 400
    assert "2013" in res.json()["detail"]

    db.query(ScheduledEvening).filter(ScheduledEvening.id == se.id).delete(synchronize_session=False)
    db.commit()


def test_reopen_season_requires_admin(client: TestClient, auth_headers: dict):
    res = client.delete("/api/v1/season/snapshots/2024", headers=auth_headers)
    assert res.status_code == 403

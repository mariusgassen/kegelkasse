"""Tests for the optional Claude-powered features (api/v1/ai.py, core/ai.py).

The Anthropic API is never called: ``core.ai._create_message`` is replaced by a fake that
records the request and returns a canned structured-output response.
"""
import json
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import anthropic
import httpx2 as httpx
import pytest
from sqlalchemy.orm import Session

import core.ai as core_ai
from api.v1 import ai as ai_api
from core.config import settings
from core.security import create_access_token, get_password_hash
from models.club import Club
from models.drink import DrinkRound
from models.evening import Evening, EveningHighlight, EveningPlayer, RegularMember
from models.game import Game
from models.payment import ClubExpense, MemberPayment
from models.penalty import PenaltyLog, PenaltyType
from models.user import User, UserRole


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    ai_api._limiter.reset()
    yield
    db.rollback()
    for e in db.query(Evening).filter(Evening.club_id == club.id).all():
        db.query(PenaltyLog).filter(PenaltyLog.evening_id == e.id).delete(synchronize_session=False)
        db.query(DrinkRound).filter(DrinkRound.evening_id == e.id).delete(synchronize_session=False)
        db.query(Game).filter(Game.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningHighlight).filter(EveningHighlight.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club.id).delete(synchronize_session=False)
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin_headers(db: Session, club: Club):
    u = User(email="admin_ai@test.de", name="AI Admin", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


class FakeClaude:
    """Stands in for the network call; records every request."""

    def __init__(self, payload=None, stop_reason="end_turn", error=None):
        self.payload = payload or {}
        self.stop_reason = stop_reason
        self.error = error
        self.calls: list[dict] = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return SimpleNamespace(stop_reason=self.stop_reason,
                               content=[SimpleNamespace(type="text", text=json.dumps(self.payload))])

    @property
    def data(self) -> str:
        return self.calls[-1]["messages"][0]["content"]


@pytest.fixture()
def claude(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    fake = FakeClaude()
    monkeypatch.setattr(core_ai, "_create_message", fake)
    return fake


@pytest.fixture()
def evening(db: Session, club: Club):
    rm = RegularMember(club_id=club.id, name="Marius Mustermann", nickname="Pudelkönig")
    rm2 = RegularMember(club_id=club.id, name="Tina Beispiel")
    db.add_all([rm, rm2])
    db.flush()
    e = Evening(club_id=club.id, date=datetime(2026, 3, 10, 20, tzinfo=timezone.utc), venue="Zum Eichhorn",
                is_closed=True)
    db.add(e)
    db.flush()
    p1 = EveningPlayer(evening_id=e.id, regular_member_id=rm.id, name="Marius Mustermann", is_king=True)
    p2 = EveningPlayer(evening_id=e.id, regular_member_id=rm2.id, name="Tina Beispiel")
    g = EveningPlayer(evening_id=e.id, name="Gast Gustav Gans")
    db.add_all([p1, p2, g])
    db.flush()
    db.add_all([
        PenaltyLog(evening_id=e.id, player_id=p1.id, player_name="Marius Mustermann", penalty_type_name="Pudel",
                   amount=0.5, client_timestamp=1),
        PenaltyLog(evening_id=e.id, player_id=p2.id, player_name="Tina Beispiel", penalty_type_name="Handy",
                   amount=2.0, client_timestamp=2),
        Game(evening_id=e.id, name="Große Hausnummer", is_opener=True, winner_ref=f"p:{p1.id}",
             status="finished", client_timestamp=3),
        DrinkRound(evening_id=e.id, drink_type="beer", participant_ids=[p1.id, g.id], client_timestamp=4),
        EveningHighlight(evening_id=e.id, text="Alle Neune im dritten Wurf"),
    ])
    db.commit()
    return e


# --- status / disabled ----------------------------------------------------

def test_status_disabled_without_key(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    assert client.get("/api/v1/ai/status", headers=auth_headers).json() == {"enabled": False}


def test_status_enabled_with_key(client, auth_headers, claude):
    assert client.get("/api/v1/ai/status", headers=auth_headers).json() == {"enabled": True}


def test_status_requires_auth(client):
    assert client.get("/api/v1/ai/status").status_code in (401, 403)


def test_recap_503_without_key(client, auth_headers, evening, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    r = client.post(f"/api/v1/ai/recap/evening/{evening.id}", headers=auth_headers)
    assert r.status_code == 503
    assert r.json()["detail"] == "ai_disabled"


# --- core wrapper -----------------------------------------------------------

def test_wrapper_sends_structured_output_and_fallbacks(client, auth_headers, evening, claude):
    claude.payload = {"title": "t", "text": "x"}
    client.post(f"/api/v1/ai/recap/evening/{evening.id}", headers=auth_headers)
    call = claude.calls[0]
    assert call["model"] == settings.ANTHROPIC_MODEL
    assert call["output_config"]["format"]["type"] == "json_schema"
    assert call["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in call["betas"]


def test_refusal_returns_503(client, auth_headers, evening, claude):
    claude.stop_reason = "refusal"
    r = client.post(f"/api/v1/ai/recap/evening/{evening.id}", headers=auth_headers)
    assert r.status_code == 503
    assert r.json()["detail"] == "ai_unavailable:refused"


def test_api_error_returns_503(client, auth_headers, evening, claude):
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    claude.error = anthropic.InternalServerError("boom", response=httpx.Response(500, request=req), body=None)
    r = client.post(f"/api/v1/ai/recap/evening/{evening.id}", headers=auth_headers)
    assert r.status_code == 503


def test_rate_limit_per_club(client, auth_headers, evening, claude, monkeypatch):
    claude.payload = {"title": "t", "text": "x"}
    monkeypatch.setattr(ai_api, "AI_CALLS_PER_HOUR", 2)
    for _ in range(2):
        assert client.post(f"/api/v1/ai/recap/evening/{evening.id}", headers=auth_headers).status_code == 200
    assert client.post(f"/api/v1/ai/recap/evening/{evening.id}", headers=auth_headers).status_code == 429


# --- recaps -----------------------------------------------------------------

def test_evening_recap_returns_text(client, auth_headers, evening, claude):
    claude.payload = {"title": "👑 Pudelkönig regiert", "text": "Was ein Abend!"}
    r = client.post(f"/api/v1/ai/recap/evening/{evening.id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"title": "👑 Pudelkönig regiert", "text": "Was ein Abend!"}


def test_evening_recap_sends_only_aliases(client, auth_headers, evening, claude):
    claude.payload = {"title": "t", "text": "x"}
    client.post(f"/api/v1/ai/recap/evening/{evening.id}", headers=auth_headers)
    data = claude.data
    assert "Pudelkönig" in data            # Kegelname
    assert "Tina" in data                  # first name when no Kegelname
    assert "Mustermann" not in data        # never the full name
    assert "Beispiel" not in data
    assert "Gans" not in data              # guests by first name only
    assert "Alle Neune im dritten Wurf" in data
    assert "Große Hausnummer" in data


def test_evening_recap_other_club_404(client, auth_headers, db, claude):
    other = Club(name="Other", slug="other-ai")
    db.add(other)
    db.flush()
    e = Evening(club_id=other.id, date=datetime(2026, 1, 1, tzinfo=timezone.utc))
    db.add(e)
    db.commit()
    try:
        assert client.post(f"/api/v1/ai/recap/evening/{e.id}", headers=auth_headers).status_code == 404
    finally:
        db.delete(e)
        db.delete(other)
        db.commit()


def test_season_recap(client, auth_headers, evening, claude):
    claude.payload = {"title": "Saison 2026", "text": "Hoch die Tassen"}
    r = client.post("/api/v1/ai/recap/season/2026", headers=auth_headers)
    assert r.status_code == 200
    facts = claude.data
    assert '"jahr": 2026' in facts and "Pudelkönig" in facts and "Mustermann" not in facts


def test_season_recap_empty_year_404(client, auth_headers, claude):
    assert client.post("/api/v1/ai/recap/season/1999", headers=auth_headers).status_code == 404
    assert claude.calls == []


# --- suggestions --------------------------------------------------------------

def test_penalty_suggestions_admin_only(client, auth_headers, claude):
    assert client.post("/api/v1/ai/suggest/penalty-types", headers=auth_headers).status_code == 403


def test_penalty_suggestions_filter_duplicates_and_clamp(client, admin_headers, db, club, evening, claude):
    db.add(PenaltyType(club_id=club.id, name="Pudel", icon="🐩", default_amount=0.5))
    db.commit()
    claude.payload = {"suggestions": [
        {"icon": "🐩", "name": "pudel", "amount": 1, "reason": "dup"},
        {"icon": "📱", "name": "Handy", "amount": 2, "reason": "oft frei eingetragen"},
        {"icon": "💸", "name": "Teuer", "amount": 9999, "reason": "zu hoch"},
    ]}
    r = client.post("/api/v1/ai/suggest/penalty-types", headers=admin_headers)
    assert r.status_code == 200
    names = [s["name"] for s in r.json()["suggestions"]]
    assert names == ["Handy", "Teuer"]
    assert r.json()["suggestions"][1]["amount"] == 100.0
    # "Handy" was free-text, so it's offered to Claude as a candidate; member names are not sent
    assert '"Handy"' in claude.data and "Tina" not in claude.data


def test_nickname_suggestions(client, admin_headers, db, club, evening, claude):
    rm = db.query(RegularMember).filter(RegularMember.name == "Tina Beispiel").first()
    claude.payload = {"suggestions": [
        {"nickname": "Pudelkönig", "reason": "vergeben"},
        {"nickname": "Handy-Tina", "reason": "Handystrafe"},
        {"nickname": "Tinamite", "reason": "Wortspiel"},
    ]}
    r = client.post(f"/api/v1/ai/suggest/nickname/{rm.id}", headers=admin_headers)
    assert r.status_code == 200
    assert [s["nickname"] for s in r.json()["suggestions"]] == ["Handy-Tina", "Tinamite"]
    assert '"vorname": "Tina"' in claude.data and "Beispiel" not in claude.data


def test_nickname_unknown_member_404(client, admin_headers, claude):
    assert client.post("/api/v1/ai/suggest/nickname/999999", headers=admin_headers).status_code == 404


# --- booking review -----------------------------------------------------------

@pytest.fixture()
def bookings(db: Session, club: Club):
    m = RegularMember(club_id=club.id, name="Klaus Kasse", nickname="Klausi")
    db.add(m)
    db.flush()
    d = date(2026, 4, 1)
    rows = [MemberPayment(club_id=club.id, regular_member_id=m.id, amount=10.0, date=d + timedelta(days=i * 7))
            for i in range(5)]
    rows += [
        MemberPayment(club_id=club.id, regular_member_id=m.id, amount=25.0, date=date(2026, 5, 10)),
        MemberPayment(club_id=club.id, regular_member_id=m.id, amount=25.0, date=date(2026, 5, 11)),  # duplicate
        MemberPayment(club_id=club.id, regular_member_id=m.id, amount=400.0, date=date(2026, 6, 1)),  # unusual
        MemberPayment(club_id=club.id, regular_member_id=m.id, amount=-30.0, date=date(2026, 6, 2)),  # payout, no note
        MemberPayment(club_id=club.id, regular_member_id=m.id, amount=15.0, date=date(2026, 6, 3),
                      is_deleted=True),
        ClubExpense(club_id=club.id, amount=50.0, description="Bahnmiete", date=date(2026, 5, 1)),
    ]
    db.add_all(rows)
    db.commit()
    return m


def test_booking_review_rules_without_key(client, admin_headers, bookings, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    r = client.post("/api/v1/ai/booking-review", headers=admin_headers,
                    json={"start": "2026-01-01", "end": "2026-12-31"})
    assert r.status_code == 200
    body = r.json()
    assert body["ai"] is False and body["booking_count"] == 10
    kinds = [f["kind"] for f in body["flags"]]
    assert kinds[0] == "duplicate"  # high severity first
    assert "unusual_amount" in kinds and "payout_without_note" in kinds
    dup = body["flags"][0]
    assert {b["amount"] for b in dup["bookings"]} == {25.0}


def test_booking_review_ai_notes(client, admin_headers, bookings, claude):
    claude.payload = {"summary": "Eine Doppelbuchung prüfen.",
                      "notes": [{"id": 0, "severity": "high", "note": "Beleg anfordern."},
                                {"id": 99, "severity": "low", "note": "ignored"}]}
    r = client.post("/api/v1/ai/booking-review", headers=admin_headers,
                    json={"start": "2026-01-01", "end": "2026-12-31"})
    body = r.json()
    assert body["ai"] is True and body["summary"] == "Eine Doppelbuchung prüfen."
    assert body["flags"][0]["ai_note"] == "Beleg anfordern."
    # only flagged bookings go to Claude, with Kegelname, not the full name
    assert "Klausi" in claude.data and "Klaus Kasse" not in claude.data
    assert "Bahnmiete" not in claude.data


def test_booking_review_ai_failure_keeps_rule_flags(client, admin_headers, bookings, claude):
    claude.stop_reason = "refusal"
    r = client.post("/api/v1/ai/booking-review", headers=admin_headers, json={})
    assert r.status_code == 200
    assert r.json()["ai"] is False and r.json()["flags"]


def test_booking_review_transfer_twins_not_duplicates(client, admin_headers, db, club, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    m = RegularMember(club_id=club.id, name="Max")
    db.add(m)
    db.flush()
    db.add_all([MemberPayment(club_id=club.id, regular_member_id=m.id, amount=20.0, date=date(2026, 2, 1),
                              transfer_group_id="g1", note="x"),
                MemberPayment(club_id=club.id, regular_member_id=m.id, amount=20.0, date=date(2026, 2, 1),
                              transfer_group_id="g1", note="x")])
    db.commit()
    r = client.post("/api/v1/ai/booking-review", headers=admin_headers,
                    json={"start": "2026-01-01", "end": "2026-12-31"})
    assert [f["kind"] for f in r.json()["flags"]] == []


def test_booking_review_admin_only_and_range(client, auth_headers, admin_headers):
    assert client.post("/api/v1/ai/booking-review", headers=auth_headers, json={}).status_code == 403
    r = client.post("/api/v1/ai/booking-review", headers=admin_headers,
                    json={"start": "2026-05-01", "end": "2026-04-01"})
    assert r.status_code == 400


def test_booking_review_allowed_for_auditor(client, db, club, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    m = RegularMember(club_id=club.id, name="Petra Prüfer", is_auditor=True)
    db.add(m)
    db.flush()
    u = User(email="auditor_ai@test.de", name="Petra", hashed_password=get_password_hash("x"),
             role=UserRole.member, club_id=club.id, is_active=True, regular_member_id=m.id)
    db.add(u)
    db.commit()
    headers = {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}
    r = client.post("/api/v1/ai/booking-review", headers=headers, json={})
    assert r.status_code == 200
    db.delete(u)
    db.commit()

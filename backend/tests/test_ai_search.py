"""Tests for the AI search (api/v1/ai_search.py) and the docs index (core/docs_index.py).

The Anthropic API is never called: ``core.ai._create_message`` is replaced by a fake.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy.orm import Session

import core.ai as core_ai
from api.v1 import ai as ai_api
from core.config import settings
from core.docs_index import build_index, get_index, heading_anchor, tokenize
from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings
from models.committee import ClubAnnouncement
from models.evening import Evening, EveningPlayer, RegularMember
from models.payment import MemberPayment
from models.penalty import PenaltyLog, PenaltyType
from models.schedule import ScheduledEvening
from models.user import User, UserRole


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    ai_api._limiter.reset()
    yield
    db.rollback()
    for e in db.query(Evening).filter(Evening.club_id == club.id).all():
        db.query(PenaltyLog).filter(PenaltyLog.evening_id == e.id).delete(synchronize_session=False)
        db.query(EveningPlayer).filter(EveningPlayer.evening_id == e.id).delete(synchronize_session=False)
    db.query(Evening).filter(Evening.club_id == club.id).delete(synchronize_session=False)
    db.query(ScheduledEvening).filter(ScheduledEvening.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubAnnouncement).filter(ClubAnnouncement.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id).update({User.regular_member_id: None}, synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


class FakeClaude:
    def __init__(self):
        self.payload = {"answer": "ok"}
        self.calls: list[dict] = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(stop_reason="end_turn",
                               content=[SimpleNamespace(type="text", text=json.dumps(self.payload))])

    @property
    def data(self) -> dict:
        content = self.calls[-1]["messages"][0]["content"]
        return json.loads(content.split("<daten>\n", 1)[1].rsplit("\n</daten>", 1)[0])


@pytest.fixture()
def claude(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    fake = FakeClaude()
    monkeypatch.setattr(core_ai, "_create_message", fake)
    return fake


@pytest.fixture()
def admin_headers(db: Session, club: Club):
    u = User(email="admin_search@test.de", name="Search Admin", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


@pytest.fixture()
def linked(db: Session, club: Club, user: User):
    """The test member, linked to a roster entry with a debt and a closed evening."""
    rm = RegularMember(club_id=club.id, name="Marius Mustermann", nickname="Pudelkönig")
    db.add(rm)
    db.flush()
    user.regular_member_id = rm.id
    db.add(MemberPayment(club_id=club.id, regular_member_id=rm.id, amount=-123.45, note="Schuld"))
    e = Evening(club_id=club.id, date=datetime(2026, 10, 1, 20, tzinfo=timezone.utc), venue="Bahn 3",
                is_closed=True)
    db.add(e)
    db.flush()
    p = EveningPlayer(evening_id=e.id, regular_member_id=rm.id, name="Marius Mustermann", is_king=True)
    db.add(p)
    db.flush()
    db.add(PenaltyLog(evening_id=e.id, player_id=p.id, player_name="Marius Mustermann",
                      penalty_type_name="Pudel", amount=77.7, client_timestamp=0))
    s = ScheduledEvening(club_id=club.id, scheduled_at=datetime.now(timezone.utc) + timedelta(days=7),
                         venue="Bahn 3")
    db.add(s)
    db.add(PenaltyType(club_id=club.id, name="Pudel", icon="🐩", default_amount=0.5))
    db.commit()
    return SimpleNamespace(member=rm, evening=e, scheduled=s)


def _ask(client, headers, q="Wie aktiviere ich Push-Benachrichtigungen?"):
    return client.post("/api/v1/ai/ask", json={"question": q}, headers=headers)


# --- docs index ---------------------------------------------------------------

def test_index_finds_shipped_docs():
    ix = get_index()
    assert ix.chunks, "docs/docs Markdown should be found in a checkout"
    top = ix.search("Wie aktiviere ich Push-Benachrichtigungen?", k=3)
    assert top and top[0].path == "funktionen/push"
    assert ix.search("Passwort vergessen", k=3)[0].path == "erste-schritte"


def test_index_chunks_by_section_and_builds_docusaurus_links(tmp_path: Path):
    (tmp_path / "funktionen").mkdir()
    (tmp_path / "funktionen" / "kasse.md").write_text(
        "---\nid: kasse\ntitle: Kasse\n---\n\n# Kasse\n\nIntro.\n\n## 📊 Übersicht\n\nSaldo und Strafen.\n\n"
        "## Bezahllink (PayPal)\n\nPayPal.me Link.\n", encoding="utf-8")
    (tmp_path / "intro.md").write_text("---\nid: intro\nslug: /\n---\n# Start\n\nHallo.\n", encoding="utf-8")
    ix = build_index(tmp_path)
    assert {(c.path, c.anchor) for c in ix.chunks} == {
        ("funktionen/kasse", None), ("funktionen/kasse", "-übersicht"),
        ("funktionen/kasse", "bezahllink-paypal"), ("", None)}
    hit = ix.search("paypal bezahlen")[0]
    assert hit.link == "docs:funktionen/kasse#bezahllink-paypal"
    assert hit.url == "/docs/funktionen/kasse#bezahllink-paypal"
    assert next(c for c in ix.chunks if c.path == "").page_title == "Start"


def test_tokenizer_folds_umlauts_and_compounds_match():
    assert tokenize("Übersicht der Strafen") == ["ubersicht", "straf"]
    assert heading_anchor("Eröffnungsspiel & König") == "eröffnungsspiel--könig"
    ix = build_index(None)
    assert ix.search("x") == []


# --- endpoint ----------------------------------------------------------------

def test_ask_requires_auth(client):
    assert client.post("/api/v1/ai/ask", json={"question": "Hallo?"}).status_code == 401


def test_ask_disabled_without_key(client, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    assert _ask(client, auth_headers).status_code == 503


def test_ask_validates_question(client, auth_headers, claude):
    assert _ask(client, auth_headers, "a").status_code == 422
    assert _ask(client, auth_headers, "x" * 501).status_code == 422


def test_ask_sends_docs_targets_and_snapshot_without_money(client, auth_headers, linked, claude):
    r = _ask(client, auth_headers, "Wie viel schulde ich? Und wie aktiviere ich Push?")
    assert r.status_code == 200
    data = claude.data
    assert data["frage"].startswith("Wie viel schulde ich")
    assert any(d["link"].startswith("docs:funktionen/push") for d in data["dokumentation"])
    targets = {t["ziel"] for t in data["app_ziele"]}
    assert "app:treasury.my_account" in targets and "app:profile.settings" in targets
    assert not any(t.startswith("app:club.") for t in targets), "admin pages not offered to members"
    facts = data["vereinsdaten"]
    assert facts["ich"]["name"] == "Pudelkönig"
    assert facts["letzte_abende"][0]["koenig"] == "Pudelkönig"
    assert facts["kommende_termine"][0]["id"] == linked.scheduled.id
    assert facts["strafenkatalog"][0]["name"] == "Pudel"
    raw = json.dumps(data, ensure_ascii=False)
    # No balances, no per-person penalty totals, no e-mails, no full names.
    assert "123.45" not in raw and "-123" not in raw
    assert "Mustermann" not in raw and "@test.de" not in raw
    assert "saldo" not in raw.lower()
    assert r.json()["sources"]


def test_admin_gets_admin_targets(client, admin_headers, claude):
    assert _ask(client, admin_headers).status_code == 200
    targets = {t["ziel"] for t in claude.data["app_ziele"]}
    assert "app:club.penalties" in targets
    assert "app:treasury.my_account" not in targets  # admin has no linked roster entry here


def test_links_are_validated_and_resolved(client, auth_headers, linked, claude):
    sid, eid = linked.scheduled.id, linked.evening.id
    claude.payload = {"answer": (
        f"Geh zu [Kasse → Konten](app:treasury.accounts), sag zu unter [Termin](app:schedule.rsvp:{sid}), "
        f"schau [den Abend](app:schedule.evening:{eid}) an, prüf [dein Konto](app:treasury.my_account) "
        "und lies [die Doku](docs:funktionen/push#benachrichtigungen-aktivieren). "
        "Profil: [Einstellungen](app:profile.settings). "
        "Kaputt: [Admin](app:club.penalties), [fremd](app:schedule.rsvp:999999), [weg](https://evil.example), "
        "[erfunden](app:nope), [Doku weg](docs:gibt/es/nicht), [Anker weg](docs:funktionen/push#quatsch)."
    )}
    r = _ask(client, auth_headers)
    assert r.status_code == 200
    body = r.json()
    answer = body["answer"]
    for bad in ("app:club.penalties", "999999", "evil.example", "app:nope", "docs:gibt"):
        assert bad not in answer
    assert "Admin" in answer and "fremd" in answer  # labels survive as text
    links = {l["href"]: l for l in body["links"]}
    assert links["app:treasury.accounts"] == {
        "href": "app:treasury.accounts", "label": "Kasse → Konten", "kind": "app",
        "to": "/treasury", "search": {"tab": "accounts"}}
    assert links[f"app:schedule.rsvp:{sid}"]["search"] == {"rsvp": sid}
    assert links[f"app:schedule.evening:{eid}"]["search"] == {"evening": eid}
    assert links["app:treasury.my_account"]["search"] == {"tab": "accounts", "member": linked.member.id}
    assert links["app:profile.settings"] == {"href": "app:profile.settings", "label": "Einstellungen",
                                             "kind": "profile", "tab": "settings"}
    assert links["docs:funktionen/push#benachrichtigungen-aktivieren"]["url"] == \
        "/docs/funktionen/push#benachrichtigungen-aktivieren"
    # Unknown anchor falls back to the page.
    assert links["docs:funktionen/push"]["url"] == "/docs/funktionen/push"
    assert "[Anker weg](docs:funktionen/push)" in answer


def test_member_without_roster_link_gets_no_my_account(client, auth_headers, claude):
    claude.payload = {"answer": "[Konto](app:treasury.my_account)"}
    r = _ask(client, auth_headers)
    assert r.json() == {**r.json(), "answer": "Konto", "links": []}


def test_search_switch_and_status(client, admin_headers, auth_headers, claude):
    assert client.get("/api/v1/ai/status", headers=auth_headers).json()["search"] is True
    r = client.patch("/api/v1/ai/settings", json={"search": False}, headers=admin_headers)
    assert r.json()["search"] is False
    assert client.get("/api/v1/ai/status", headers=auth_headers).json()["search"] is False
    r = _ask(client, auth_headers)
    assert r.status_code == 403 and r.json()["detail"] == "ai_feature_disabled"
    assert claude.calls == []


def test_ask_uses_club_model_and_limit(client, admin_headers, auth_headers, claude):
    client.patch("/api/v1/ai/settings", json={"model": "claude-haiku-5-5", "calls_per_hour": 1},
                 headers=admin_headers)
    assert _ask(client, auth_headers).status_code == 200
    assert claude.calls[-1]["model"] == "claude-haiku-5-5"
    assert _ask(client, auth_headers).status_code == 429


def test_answer_language_follows_user_locale(client, db, user, auth_headers, claude):
    user.preferred_locale = "en"
    db.commit()
    _ask(client, auth_headers)
    assert claude.data["sprache"] == "en"

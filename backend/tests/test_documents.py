"""Tests for the club documents endpoints (upload, versioned list, protected download, acknowledgements,
review requests with Frist and reminders)."""
import io
import json
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

import core.ai as core_ai
from core.config import settings
from core.security import create_access_token, get_password_hash
from models.club import Club
from models.document import (
    ClubDocument, ClubDocumentAcknowledgement, ClubDocumentReviewRecipient, ClubDocumentReviewRequest,
)
from models.user import User, UserRole

BASE = "/api/v1/club/documents/"


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    db.query(ClubDocumentReviewRecipient).delete(synchronize_session=False)
    db.query(ClubDocumentReviewRequest).delete(synchronize_session=False)
    db.query(ClubDocumentAcknowledgement).delete(synchronize_session=False)
    db.query(ClubDocument).delete(synchronize_session=False)
    db.commit()


def _headers(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


def _pdf() -> bytes:
    return b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"


@pytest.fixture()
def admin(db, club):
    u = User(email="doc_admin@test.de", name="Doku Admin", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def other_club_user(db):
    other = Club(name="Other Club", slug="other-club")
    db.add(other)
    db.commit()
    db.refresh(other)
    u = User(email="other@test.de", name="Other Member", hashed_password=get_password_hash("x"),
             role=UserRole.member, club_id=other.id, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u
    db.query(User).filter(User.club_id == other.id).delete(synchronize_session=False)
    db.delete(other)
    db.commit()


def _upload(client, admin, **overrides):
    fields = {
        "title": "Satzung", "document_type": "satzung", "version": "1.0",
        "decision_date": "2026-11-16", "effective_date": "2026-11-17",
    }
    fields.update(overrides)
    files = {"file": ("Satzung_KCE.pdf", io.BytesIO(_pdf()), "application/pdf")}
    return client.post(BASE, files=files, data=fields, headers=_headers(admin))


def test_upload_and_list(client, admin, user):
    assert _upload(client, admin).status_code == 201

    res = client.get(BASE, headers=_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["can_upload"] is True
    assert body["member_count"] >= 2
    assert len(body["documents"]) == 1
    doc = body["documents"][0]
    assert doc["title"] == "Satzung"
    assert doc["document_type"] == "satzung"
    assert doc["decision_date"] == "2026-11-16"
    assert doc["effective_date"] == "2026-11-17"
    assert doc["is_current"] is True
    assert doc["my_response"] is None


def test_upload_requires_auth_and_admin_for_decision_docs(client, user, admin):
    files = {"file": ("x.pdf", io.BytesIO(_pdf()), "application/pdf")}
    assert client.post(BASE, files=files, data={"title": "Satzung"}).status_code == 401
    # Members cannot upload decision documents (satzung/geschaeftsordnung)
    res_decision = client.post(BASE, files={"file": ("x.pdf", io.BytesIO(_pdf()), "application/pdf")},
                               data={"title": "Satzung", "document_type": "satzung"}, headers=_headers(user))
    assert res_decision.status_code == 403
    # Members can upload protocols
    res_proto = client.post(BASE, files={"file": ("p.pdf", io.BytesIO(_pdf()), "application/pdf")},
                            data={"title": "Protokoll JHV", "document_type": "protokoll"}, headers=_headers(user))
    assert res_proto.status_code == 201


def test_upload_validation(client, admin):
    assert _upload(client, admin, title=" ").status_code == 400
    assert _upload(client, admin, document_type="geheim").status_code == 400
    assert _upload(client, admin, decision_date="16.11.2026").status_code == 400
    wrong_type = {"file": ("x.png", io.BytesIO(b"\x89PNG"), "image/png")}
    assert client.post(BASE, files=wrong_type, data={"title": "Satzung"},
                       headers=_headers(admin)).status_code == 400
    not_pdf = {"file": ("x.pdf", io.BytesIO(b"hello"), "application/pdf")}
    assert client.post(BASE, files=not_pdf, data={"title": "Satzung"},
                       headers=_headers(admin)).status_code == 400
    big = {"file": ("x.pdf", io.BytesIO(b"%PDF" + b"0" * (10 * 1024 * 1024)), "application/pdf")}
    assert client.post(BASE, files=big, data={"title": "Satzung"},
                       headers=_headers(admin)).status_code == 413


def test_versioning_keeps_history(client, admin, user, db, club):
    first = _upload(client, admin, title="Satzung", version="1.0").json()
    second = _upload(client, admin, title="Satzung", version="2.0", group_id=first["group_id"]).json()
    assert second["group_id"] == first["group_id"]

    docs = client.get(BASE, headers=_headers(user)).json()["documents"]
    assert len(docs) == 2
    by_version = {d["version"]: d for d in docs}
    assert by_version["1.0"]["is_current"] is False
    assert by_version["2.0"]["is_current"] is True


def test_download_is_member_only_and_not_public(client, admin, user, other_club_user, db):
    doc = _upload(client, admin).json()

    assert client.get(f"{BASE}{doc['id']}/download").status_code == 401
    res = client.get(f"{BASE}{doc['id']}/download", headers=_headers(user))
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/pdf")
    assert 'attachment; filename="Satzung_KCE.pdf"' in res.headers["content-disposition"]
    assert res.content.startswith(b"%PDF")
    assert client.get(f"{BASE}{doc['id']}/download",
                      headers=_headers(other_club_user)).status_code == 404

    stored = db.query(ClubDocument).filter(ClubDocument.id == doc["id"]).first()
    assert client.get(f"/uploads/{stored.file_key}").status_code == 404


def test_acknowledge_and_withdraw(client, admin, user, second_user):
    doc = _upload(client, admin).json()

    res = client.post(f"{BASE}{doc['id']}/acknowledge", json={"response": "agreed"},
                      headers=_headers(user))
    assert res.status_code == 200
    assert res.json()["my_response"] == "agreed"
    assert res.json()["acknowledged_count"] == 1

    detail = client.get(f"{BASE}{doc['id']}", headers=_headers(second_user)).json()
    assert detail["acknowledged_count"] == 1
    assert detail["acknowledgements"][0]["responder_name"] == "Test Member"
    assert detail["acknowledgements"][0]["is_me"] is False

    assert client.post(f"{BASE}{doc['id']}/acknowledge", json={"response": "nope"},
                       headers=_headers(user)).status_code == 400
    assert client.delete(f"{BASE}{doc['id']}/acknowledge",
                         headers=_headers(second_user)).status_code == 404
    assert client.delete(f"{BASE}{doc['id']}/acknowledge", headers=_headers(user)).status_code == 204
    assert client.get(BASE, headers=_headers(user)).json()["documents"][0]["my_response"] is None


def test_delete_rules(client, admin, user):
    doc = _upload(client, admin).json()
    assert client.delete(f"{BASE}{doc['id']}", headers=_headers(user)).status_code == 403

    client.post(f"{BASE}{doc['id']}/acknowledge", json={"response": "acknowledged"},
                headers=_headers(user))
    res = client.delete(f"{BASE}{doc['id']}", headers=_headers(admin))
    assert res.status_code == 400
    assert "acknowledgements" in res.json()["detail"]

    client.delete(f"{BASE}{doc['id']}/acknowledge", headers=_headers(user))
    assert client.delete(f"{BASE}{doc['id']}", headers=_headers(admin)).status_code == 204
    assert client.get(BASE, headers=_headers(user)).json()["documents"] == []


# ── KI: Formularvorschlag + Zusammenfassung ─────────────────────────────────────────────────────

ANALYZE = f"{BASE}analyze"


class _FakeClaude:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(stop_reason="end_turn",
                               content=[SimpleNamespace(type="text", text=json.dumps(self.payload))])


@pytest.fixture()
def claude(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    fake = _FakeClaude({
        "title": "Satzung KCE", "document_type": "satzung", "version": "2.0",
        "decision_date": "2026-11-16", "effective_date": "kein-datum",
        "summary": "- Zweck des Vereins", "change_summary": "- Beitrag erhöht",
    })
    monkeypatch.setattr(core_ai, "_create_message", fake)
    return fake


def _analyze(client, who, **data):
    files = {"file": ("neu.pdf", io.BytesIO(_pdf()), "application/pdf")}
    return client.post(ANALYZE, files=files, data=data, headers=_headers(who))


def test_analyze_suggests_fields_for_new_document(client, admin, claude):
    res = _analyze(client, admin)
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "Satzung KCE"
    assert body["document_type"] == "satzung"
    assert body["decision_date"] == "2026-11-16"
    assert body["effective_date"] is None          # invalid date is dropped
    assert body["summary"] == "- Zweck des Vereins"
    assert body["change_summary"] is None          # no previous version to compare with
    blocks = claude.calls[0]["messages"][0]["content"]
    assert [b["type"] for b in blocks] == ["document", "text"]
    assert nothing_stored(client, admin)


def nothing_stored(client, admin):
    return client.get(BASE, headers=_headers(admin)).json()["documents"] == []


def test_analyze_new_version_compares_with_previous(client, admin, claude):
    first = _upload(client, admin).json()
    res = _analyze(client, admin, group_id=first["group_id"])
    assert res.status_code == 200
    assert res.json()["change_summary"] == "- Beitrag erhöht"
    blocks = claude.calls[0]["messages"][0]["content"]
    assert [b["type"] for b in blocks] == ["document", "document", "text"]


def test_analyze_errors(client, admin, user, claude, monkeypatch):
    assert client.post(ANALYZE, files={"file": ("x.pdf", io.BytesIO(_pdf()), "application/pdf")}).status_code == 401
    assert _analyze(client, user).status_code == 200
    assert _analyze(client, admin, group_id="unbekannt").status_code == 404
    bad = {"file": ("x.pdf", io.BytesIO(b"hello"), "application/pdf")}
    assert client.post(ANALYZE, files=bad, headers=_headers(admin)).status_code == 400
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    assert _analyze(client, admin).status_code == 503


def test_upload_stores_summaries(client, admin, user):
    res = _upload(client, admin, summary="  - Zweck  ", change_summary="- Beitrag erhöht")
    assert res.status_code == 201
    doc = client.get(BASE, headers=_headers(user)).json()["documents"][0]
    assert doc["summary"] == "- Zweck"
    assert doc["change_summary"] == "- Beitrag erhöht"
    plain = _upload(client, admin, title="Ohne").json()
    assert plain["summary"] is None and plain["change_summary"] is None


def test_analyze_schema_enum_matches_declared_type():
    """The API rejects enum values that don't fit the property's declared type (a null-able type list
    with a string enum caused a 400 in production), so the enum must sit on a plain string branch."""
    from api.v1.documents import _ANALYZE_SCHEMA

    prop = _ANALYZE_SCHEMA["properties"]["document_type"]
    assert "enum" not in prop and "type" not in prop
    branches = {b["type"]: b for b in prop["anyOf"]}
    assert set(branches) == {"string", "null"}
    assert branches["string"]["enum"] == ["satzung", "geschaeftsordnung", "protokoll", "sonstiges"]
    for name, p in _ANALYZE_SCHEMA["properties"].items():
        assert not isinstance(p.get("type"), list), name


def test_analyze_prompt_asks_for_markdown_and_passes_hint(client, admin, claude):
    first = _upload(client, admin, version="1.0").json()
    res = _analyze(client, admin, group_id=first["group_id"], hint="Achte auf die Beiträge")
    assert res.status_code == 200
    call = claude.calls[0]
    assert "Markdown" in call["system"]
    text = call["messages"][0]["content"][-1]["text"]
    assert "Achte auf die Beiträge" in text
    assert '"bisherige_version": "1.0"' in text


def test_update_metadata_only(client, admin, user):
    doc = _upload(client, admin, title="Satzung", version="1.0", summary="- alt").json()
    res = client.patch(f"{BASE}{doc['id']}", headers=_headers(admin), json={
        "title": " Satzung KCE ", "version": "1.1", "document_type": "geschaeftsordnung",
        "decision_date": None, "summary": "- neu **fett**",
    })
    assert res.status_code == 200
    body = res.json()
    assert body["title"] == "Satzung KCE"
    assert body["version"] == "1.1"
    assert body["document_type"] == "geschaeftsordnung"
    assert body["decision_date"] is None          # explicitly cleared
    assert body["effective_date"] == "2026-11-17"  # not sent -> untouched
    assert body["summary"] == "- neu **fett**"
    assert body["file_name"] == "Satzung_KCE.pdf" and body["id"] == doc["id"]
    # the file is untouched and still downloadable
    assert client.get(f"{BASE}{doc['id']}/download", headers=_headers(user)).content == _pdf()


def test_update_metadata_rules(client, admin, user):
    doc = _upload(client, admin).json()
    url = f"{BASE}{doc['id']}"
    assert client.patch(url, json={"title": "X"}).status_code == 401
    assert client.patch(url, json={"title": "X"}, headers=_headers(user)).status_code == 403
    assert client.patch(f"{BASE}999999", json={"title": "X"}, headers=_headers(admin)).status_code == 404
    assert client.patch(url, json={"title": "  "}, headers=_headers(admin)).status_code == 400
    assert client.patch(url, json={"document_type": "geheim"}, headers=_headers(admin)).status_code == 400
    assert client.patch(url, json={"effective_date": "17.11.2026"}, headers=_headers(admin)).status_code == 400


# ── Prüf-/Zustimmungsanfragen mit Frist und Erinnerungen ──────────────────────────────────────────


def _review(client, admin, doc_id, **overrides):
    payload = {
        "document_id": doc_id,
        "deadline": (date.today() + timedelta(days=7)).isoformat(),
    }
    payload.update(overrides)
    return client.post(f"{BASE}requests", json=payload, headers=_headers(admin))


def test_review_request_create_notify_and_visibility(client, admin, user, second_user, other_club_user, db):
    doc = _upload(client, admin).json()
    with patch("core.document_reviews.notify_user", return_value=True) as mock_notify:
        res = _review(client, admin, doc["id"], title="Satzung prüfen", message="Bitte lesen!")
    assert res.status_code == 201
    body = res.json()
    assert body["title"] == "Satzung prüfen"
    assert body["status"] == "open"
    assert body["document_id"] == doc["id"]
    assert body["recipient_count"] >= 2
    assert body["pending_count"] == body["recipient_count"]
    assert body["my_response"] is None
    assert mock_notify.call_count >= 2
    args = mock_notify.call_args.args
    assert args[4] == f"/#documents?item={doc['id']}"
    assert mock_notify.call_args.kwargs["category"] == "documents"

    admin_list = client.get(f"{BASE}requests", headers=_headers(admin))
    assert admin_list.status_code == 200
    assert admin_list.json()["requests"][0]["id"] == body["id"]
    assert client.get(f"{BASE}requests", headers=_headers(user)).status_code == 403

    detail = client.get(f"{BASE}requests/{body['id']}", headers=_headers(admin)).json()
    assert len(detail["recipients"]) == detail["recipient_count"]
    assert all(r["response"] is None for r in detail["recipients"])

    mine = client.get(f"{BASE}requests/mine", headers=_headers(user)).json()
    assert [r["id"] for r in mine["requests"]] == [body["id"]]
    assert client.get(f"{BASE}requests/mine", headers=_headers(other_club_user)).json()["requests"] == []
    # An admin of a different club must not see this club's request either.
    other_club_user.role = UserRole.admin
    db.commit()
    assert client.get(f"{BASE}requests/{body['id']}", headers=_headers(other_club_user)).status_code == 404


def test_review_progress_and_reminders_follow_acknowledgements(client, admin, user, second_user):
    doc = _upload(client, admin).json()
    res = _review(client, admin, doc["id"], user_ids=[user.id, second_user.id])
    assert res.status_code == 201
    req_id = res.json()["id"]
    assert res.json()["recipient_count"] == 2

    client.post(f"{BASE}{doc['id']}/acknowledge", json={"response": "agreed"}, headers=_headers(user))
    detail = client.get(f"{BASE}requests/{req_id}", headers=_headers(admin)).json()
    assert detail["responded_count"] == 1
    assert detail["pending_count"] == 1

    with patch("core.document_reviews.notify_user", return_value=True) as mock_notify:
        reminded = client.post(f"{BASE}requests/{req_id}/remind", headers=_headers(admin))
    assert reminded.status_code == 200
    assert reminded.json()["sent"] == 1
    assert mock_notify.call_count == 1
    assert mock_notify.call_args.args[1].id == second_user.id

    # A second reminder on the same day is a no-op for the already-reminded member.
    with patch("core.document_reviews.notify_user", return_value=True) as mock_notify:
        assert client.post(f"{BASE}requests/{req_id}/remind", headers=_headers(admin)).json()["sent"] == 0
        assert mock_notify.call_count == 0

    # Withdrawing the acknowledgement reopens that recipient's response.
    client.delete(f"{BASE}{doc['id']}/acknowledge", headers=_headers(user))
    with patch("core.document_reviews.notify_user", return_value=True):
        assert client.post(f"{BASE}requests/{req_id}/remind", headers=_headers(admin)).json()["sent"] == 1


def test_review_request_validation_and_delete_guard(client, admin, user, other_club_user):
    doc = _upload(client, admin).json()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    assert _review(client, admin, doc["id"], deadline=yesterday).status_code == 400
    assert _review(client, admin, doc["id"], reminder_days_before=31).status_code == 400
    assert _review(client, admin, doc["id"], user_ids=[]).status_code == 400
    assert _review(client, admin, doc["id"], user_ids=[other_club_user.id]).status_code == 400
    assert _review(client, user, doc["id"]).status_code == 403
    assert _review(client, admin, 999999).status_code == 404

    req = _review(client, admin, doc["id"]).json()
    res = client.delete(f"{BASE}{doc['id']}", headers=_headers(admin))
    assert res.status_code == 400
    assert "review requests" in res.json()["detail"]
    assert client.delete(f"{BASE}requests/{req['id']}", headers=_headers(user)).status_code == 403


def test_review_request_close_and_cancel(client, admin, user):
    doc = _upload(client, admin).json()
    req_id = _review(client, admin, doc["id"]).json()["id"]

    closed = client.post(f"{BASE}requests/{req_id}/close", headers=_headers(admin))
    assert closed.status_code == 200
    assert closed.json()["status"] == "closed"
    assert client.get(f"{BASE}requests/mine", headers=_headers(user)).json()["requests"] == []
    assert client.post(f"{BASE}requests/{req_id}/remind", headers=_headers(admin)).status_code == 400
    assert client.post(f"{BASE}requests/{req_id}/close", headers=_headers(admin)).status_code == 400

    assert client.delete(f"{BASE}requests/{req_id}", headers=_headers(admin)).status_code == 204
    assert client.get(f"{BASE}requests/{req_id}", headers=_headers(admin)).status_code == 404


def test_automatic_review_reminder_on_due_date(client, admin, user, db, club):
    from core.reminders import send_document_review_reminders

    doc = _upload(client, admin).json()
    today = date.today()
    deadline = today + timedelta(days=2)
    res = _review(client, admin, doc["id"], deadline=deadline.isoformat(),
                  reminder_days_before=2, user_ids=[user.id])
    assert res.status_code == 201

    with patch("core.document_reviews.notify_user", return_value=True) as mock_notify:
        assert send_document_review_reminders(db, club, today - timedelta(days=1)) == 0
        assert mock_notify.call_count == 0
        assert send_document_review_reminders(db, club, today) == 1
        assert mock_notify.call_count == 1
        assert send_document_review_reminders(db, club, today) == 0

    recipient = db.query(ClubDocumentReviewRecipient).filter(
        ClubDocumentReviewRecipient.request_id == res.json()["id"]
    ).first()
    assert recipient.reminder_count == 1
    assert recipient.reminded_at is not None

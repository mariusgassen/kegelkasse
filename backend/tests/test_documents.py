"""Tests for the club documents endpoints (upload, versioned list, protected download, acknowledgements)."""
import io

import pytest
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.document import ClubDocument, ClubDocumentAcknowledgement
from models.user import User, UserRole

BASE = "/api/v1/club/documents/"


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
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
    assert body["can_upload"] is False
    assert body["member_count"] >= 2
    assert len(body["documents"]) == 1
    doc = body["documents"][0]
    assert doc["title"] == "Satzung"
    assert doc["document_type"] == "satzung"
    assert doc["decision_date"] == "2026-11-16"
    assert doc["effective_date"] == "2026-11-17"
    assert doc["is_current"] is True
    assert doc["my_response"] is None


def test_upload_requires_auth_and_admin(client, user, admin):
    files = {"file": ("x.pdf", io.BytesIO(_pdf()), "application/pdf")}
    assert client.post(BASE, files=files, data={"title": "Satzung"}).status_code == 401
    res = client.post(BASE, files=files, data={"title": "Satzung"}, headers=_headers(user))
    assert res.status_code == 403


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

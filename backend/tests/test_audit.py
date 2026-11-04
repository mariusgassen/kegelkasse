"""
Tests for the Kassenprüfung (treasury audit) endpoints:
  GET/PATCH /treasury-audits/auditors[/{mid}]
  GET /treasury-audits/, /preview, /{aid}
  POST /treasury-audits/, /{aid}/sign
  DELETE /treasury-audits/{aid}, /{aid}/sign
"""
from datetime import date, datetime, timezone

import pytest
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.audit import TreasuryAudit, TreasuryAuditSignature
from models.club import Club
from models.evening import RegularMember
from models.payment import ClubExpense, MemberPayment
from models.user import User, UserRole


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    db.rollback()
    ids = [a.id for a in db.query(TreasuryAudit).filter(TreasuryAudit.club_id == club.id).all()]
    if ids:
        db.query(TreasuryAuditSignature).filter(TreasuryAuditSignature.audit_id.in_(ids)).delete(
            synchronize_session=False)
    db.query(TreasuryAudit).filter(TreasuryAudit.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club.id).delete(synchronize_session=False)
    db.query(User).filter(User.club_id == club.id).update({User.regular_member_id: None},
                                                          synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


def _headers(u: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


@pytest.fixture()
def admin(db, club):
    u = User(email="audit_admin@test.de", name="Kassenwart", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def alice(db, club):
    rm = RegularMember(club_id=club.id, name="Alice Prüfer", nickname="Ali", is_active=True)
    db.add(rm)
    db.commit()
    db.refresh(rm)
    return rm


@pytest.fixture()
def auditor(db, club, alice):
    alice.is_auditor = True
    u = User(email="auditor@test.de", name="Alice", hashed_password=get_password_hash("x"),
             role=UserRole.member, club_id=club.id, is_active=True, regular_member_id=alice.id)
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _pay(db, club, member, amount, d, **kw):
    p = MemberPayment(club_id=club.id, regular_member_id=member.id, amount=amount, date=d, **kw)
    db.add(p)
    db.commit()
    return p


def _exp(db, club, amount, d, desc="Bahnmiete", **kw):
    e = ClubExpense(club_id=club.id, amount=amount, description=desc, date=d, **kw)
    db.add(e)
    db.commit()
    return e


class TestAuditors:
    def test_admin_sets_auditor(self, client, admin, alice):
        r = client.patch(f"/api/v1/treasury-audits/auditors/{alice.id}", json={"is_auditor": True},
                         headers=_headers(admin))
        assert r.status_code == 200 and r.json()["is_auditor"] is True
        r = client.get("/api/v1/treasury-audits/auditors", headers=_headers(admin))
        assert [m["id"] for m in r.json()] == [alice.id]
        r = client.get("/api/v1/club/regular-members", headers=_headers(admin))
        assert next(m for m in r.json() if m["id"] == alice.id)["is_auditor"] is True

    def test_member_cannot_set_auditor(self, client, auth_headers, alice):
        r = client.patch(f"/api/v1/treasury-audits/auditors/{alice.id}", json={"is_auditor": True},
                         headers=auth_headers)
        assert r.status_code == 403

    def test_guest_cannot_be_auditor(self, client, db, club, admin):
        g = RegularMember(club_id=club.id, name="Gast", is_guest=True, is_active=True)
        db.add(g)
        db.commit()
        r = client.patch(f"/api/v1/treasury-audits/auditors/{g.id}", json={"is_auditor": True},
                         headers=_headers(admin))
        assert r.status_code == 400

    def test_unknown_member_404(self, client, admin):
        r = client.patch("/api/v1/treasury-audits/auditors/999999", json={"is_auditor": True},
                         headers=_headers(admin))
        assert r.status_code == 404


class TestSnapshot:
    def test_cash_figures(self, client, db, club, admin, alice):
        _pay(db, club, alice, 50.0, date(2025, 12, 1))           # before period → opening
        _exp(db, club, 20.0, date(2025, 12, 2))                  # before period → opening
        _pay(db, club, alice, 30.0, date(2026, 1, 10))           # deposit
        _pay(db, club, alice, -5.0, date(2026, 2, 1))            # payout
        _exp(db, club, 12.5, date(2026, 3, 1))                   # expense
        _exp(db, club, -8.0, date(2026, 4, 1), desc="Spende")    # other income
        _pay(db, club, alice, 99.0, date(2027, 1, 1))            # after period → ignored
        _pay(db, club, alice, 1000.0, date(2026, 5, 1), is_deleted=True)  # cancelled → never cash

        r = client.get("/api/v1/treasury-audits/preview",
                       params={"period_start": "2026-01-01", "period_end": "2026-12-31"},
                       headers=_headers(admin))
        assert r.status_code == 200
        s = r.json()
        assert s["opening_cash"] == 30.0
        assert s["deposits"] == 30.0
        assert s["payouts"] == 5.0
        assert s["expenses"] == 12.5
        assert s["other_income"] == 8.0
        assert s["closing_cash"] == 50.5
        assert s["booking_count"] == 4
        assert [b["date"] for b in s["bookings"]] == ["2026-01-10", "2026-02-01", "2026-03-01", "2026-04-01"]
        # Expense cash effect is negative, other income positive
        assert [b["amount"] for b in s["bookings"]] == [30.0, -5.0, -12.5, 8.0]
        assert s["bookings"][0]["label"] == "Ali"

    def test_lists_edits_and_cancellations_in_period(self, client, db, club, admin, alice):
        _pay(db, club, alice, 10.0, date(2026, 1, 1), updated_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
             updated_by=admin.id)
        _pay(db, club, alice, 15.0, date(2026, 1, 2), is_deleted=True,
             deleted_at=datetime(2026, 3, 1, tzinfo=timezone.utc), deleted_by=admin.id, delete_reason="doppelt")
        _pay(db, club, alice, 1.0, date(2026, 1, 3), updated_at=datetime(2027, 1, 1, tzinfo=timezone.utc))

        s = client.get("/api/v1/treasury-audits/preview",
                       params={"period_start": "2026-01-01", "period_end": "2026-12-31"},
                       headers=_headers(admin)).json()
        assert len(s["edited"]) == 1 and s["edited"][0]["updated_by"] == "Kassenwart"
        assert len(s["cancelled"]) == 1 and s["cancelled"][0]["reason"] == "doppelt"

    def test_balances_and_outstanding(self, client, db, club, admin, alice):
        _pay(db, club, alice, 7.0, date(2026, 1, 1))
        s = client.get("/api/v1/treasury-audits/preview",
                       params={"period_start": "2026-01-01", "period_end": "2026-12-31"},
                       headers=_headers(admin)).json()
        row = next(b for b in s["balances"] if b["regular_member_id"] == alice.id)
        assert row["balance"] == 7.0 and row["is_guest"] is False
        assert s["credit_total"] == 7.0 and s["outstanding_total"] == 0.0

    def test_invalid_period(self, client, admin):
        r = client.get("/api/v1/treasury-audits/preview",
                       params={"period_start": "2026-12-31", "period_end": "2026-01-01"}, headers=_headers(admin))
        assert r.status_code == 400
        r = client.get("/api/v1/treasury-audits/preview",
                       params={"period_start": "nope", "period_end": "2026-01-01"}, headers=_headers(admin))
        assert r.status_code == 400


class TestAuditLifecycle:
    def _create(self, client, u, **kw):
        body = {"period_start": "2026-01-01", "period_end": "2026-12-31", "title": "Jahresprüfung 2026"} | kw
        return client.post("/api/v1/treasury-audits/", json=body, headers=_headers(u))

    def test_unauthenticated(self, client):
        assert client.get("/api/v1/treasury-audits/").status_code == 401

    def test_member_cannot_create(self, client, auth_headers):
        r = client.post("/api/v1/treasury-audits/",
                        json={"period_start": "2026-01-01", "period_end": "2026-12-31"}, headers=auth_headers)
        assert r.status_code == 403

    def test_admin_creates_and_snapshot_is_frozen(self, client, db, club, admin, alice, auditor):
        _pay(db, club, alice, 20.0, date(2026, 6, 1))
        r = self._create(client, admin)
        assert r.status_code == 201
        a = r.json()
        assert a["status"] == "open" and a["summary"]["closing_cash"] == 20.0
        assert a["title"] == "Jahresprüfung 2026"
        # A later booking in the period must not change what the auditors sign
        _pay(db, club, alice, 500.0, date(2026, 7, 1))
        again = client.get(f"/api/v1/treasury-audits/{a['id']}", headers=_headers(admin)).json()
        assert again["summary"]["closing_cash"] == 20.0
        assert len(again["snapshot"]["bookings"]) == 1

    def test_auditor_can_create(self, client, auditor):
        assert self._create(client, auditor).status_code == 201

    def test_list_flags(self, client, admin, auditor, auth_headers):
        self._create(client, admin)
        r = client.get("/api/v1/treasury-audits/", headers=_headers(auditor)).json()
        assert r["can_sign"] is True and r["can_create"] is True and len(r["audits"]) == 1
        assert "snapshot" not in r["audits"][0]
        r = client.get("/api/v1/treasury-audits/", headers=auth_headers).json()
        assert r["can_sign"] is False and r["can_create"] is False and len(r["audits"]) == 1

    def test_sign_approve(self, client, admin, auditor):
        aid = self._create(client, admin).json()["id"]
        r = client.post(f"/api/v1/treasury-audits/{aid}/sign", json={"approved": True, "note": "Alles korrekt"},
                        headers=_headers(auditor))
        assert r.status_code == 200
        a = r.json()
        assert a["status"] == "approved" and a["signed_by_me"] is True
        assert a["signatures"][0]["signer_name"] == "Ali" and a["signatures"][0]["note"] == "Alles korrekt"

    def test_objection_needs_note(self, client, admin, auditor):
        aid = self._create(client, admin).json()["id"]
        r = client.post(f"/api/v1/treasury-audits/{aid}/sign", json={"approved": False},
                        headers=_headers(auditor))
        assert r.status_code == 400
        r = client.post(f"/api/v1/treasury-audits/{aid}/sign",
                        json={"approved": False, "note": "Beleg fehlt"}, headers=_headers(auditor))
        assert r.json()["status"] == "objection"

    def test_admin_without_auditor_flag_cannot_sign(self, client, admin):
        aid = self._create(client, admin).json()["id"]
        r = client.post(f"/api/v1/treasury-audits/{aid}/sign", json={"approved": True}, headers=_headers(admin))
        assert r.status_code == 403

    def test_double_sign_rejected_and_withdraw(self, client, admin, auditor):
        aid = self._create(client, admin).json()["id"]
        client.post(f"/api/v1/treasury-audits/{aid}/sign", json={"approved": True}, headers=_headers(auditor))
        r = client.post(f"/api/v1/treasury-audits/{aid}/sign", json={"approved": True}, headers=_headers(auditor))
        assert r.status_code == 400
        assert client.delete(f"/api/v1/treasury-audits/{aid}/sign", headers=_headers(auditor)).status_code == 204
        assert client.get(f"/api/v1/treasury-audits/{aid}", headers=_headers(auditor)).json()["status"] == "open"
        assert client.delete(f"/api/v1/treasury-audits/{aid}/sign", headers=_headers(auditor)).status_code == 404

    def test_delete_only_unsigned_by_admin(self, client, admin, auditor):
        aid = self._create(client, admin).json()["id"]
        assert client.delete(f"/api/v1/treasury-audits/{aid}", headers=_headers(auditor)).status_code == 403
        client.post(f"/api/v1/treasury-audits/{aid}/sign", json={"approved": True}, headers=_headers(auditor))
        assert client.delete(f"/api/v1/treasury-audits/{aid}", headers=_headers(admin)).status_code == 400
        aid2 = self._create(client, admin).json()["id"]
        assert client.delete(f"/api/v1/treasury-audits/{aid2}", headers=_headers(admin)).status_code == 204
        assert client.get(f"/api/v1/treasury-audits/{aid2}", headers=_headers(admin)).status_code == 404

    def test_invalid_period_on_create(self, client, admin):
        assert self._create(client, admin, period_start="2026-05-01", period_end="2026-04-01").status_code == 400

    def test_club_isolation(self, client, db, admin):
        other = Club(name="Other", slug="other-audit")
        db.add(other)
        db.commit()
        a = TreasuryAudit(club_id=other.id, period_start=date(2026, 1, 1), period_end=date(2026, 12, 31),
                          snapshot={})
        db.add(a)
        db.commit()
        try:
            assert client.get(f"/api/v1/treasury-audits/{a.id}", headers=_headers(admin)).status_code == 404
            assert client.get("/api/v1/treasury-audits/", headers=_headers(admin)).json()["audits"] == []
        finally:
            db.delete(a)
            db.delete(other)
            db.commit()

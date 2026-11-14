"""
Tests for the report export endpoint:
  GET /reports/export?format=xlsx
  GET /reports/data   (JSON the app renders into its PDF)
"""
import pytest
from datetime import datetime
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.evening import Evening, EveningPlayer, RegularMember
from models.penalty import PenaltyLog, PenaltyType
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    yield
    from models.drink import DrinkRound
    from models.game import Game, GameThrowLog
    from models.evening import EveningHighlight
    from models.payment import MemberPayment, ClubExpense
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
    db.query(PenaltyType).filter(PenaltyType.club_id == club.id).delete(synchronize_session=False)
    db.query(MemberPayment).filter(MemberPayment.club_id == club.id).delete(synchronize_session=False)
    db.query(ClubExpense).filter(ClubExpense.club_id == club.id).delete(synchronize_session=False)
    db.query(RegularMember).filter(RegularMember.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin_user(db: Session, club: Club) -> User:
    u = User(
        email="reportadmin@test.de",
        name="Report Admin",
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


# ---------------------------------------------------------------------------
# GET /reports/export
# ---------------------------------------------------------------------------

class TestExportReport:
    def test_xlsx_format_returns_excel(self, client, admin_headers):
        r = client.get("/api/v1/reports/export?format=xlsx", headers=admin_headers)
        assert r.status_code == 200
        ct = r.headers["content-type"]
        assert "spreadsheetml" in ct or "officedocument" in ct
        # Excel files start with PK (zip header)
        assert r.content[:2] == b"PK"

    def test_pdf_format_is_no_longer_served(self, client, admin_headers):
        # The PDF is built in the app from /reports/data.
        r = client.get("/api/v1/reports/export?format=pdf", headers=admin_headers)
        assert r.status_code == 400

    def test_default_format_is_xlsx(self, client, admin_headers):
        r = client.get("/api/v1/reports/export", headers=admin_headers)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"

    def test_invalid_format_returns_400(self, client, admin_headers):
        r = client.get("/api/v1/reports/export?format=csv", headers=admin_headers)
        assert r.status_code == 400

    def test_member_cannot_export(self, client, auth_headers):
        r = client.get("/api/v1/reports/export", headers=auth_headers)
        assert r.status_code == 403

    def test_401_without_auth(self, client):
        r = client.get("/api/v1/reports/export")
        assert r.status_code == 401

    def test_year_filter_xlsx(self, client, admin_headers):
        r = client.get("/api/v1/reports/export?format=xlsx&year=2025", headers=admin_headers)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"

    def test_xlsx_content_disposition_contains_filename(self, client, admin_headers):
        r = client.get("/api/v1/reports/export?format=xlsx", headers=admin_headers)
        cd = r.headers.get("content-disposition", "")
        assert "kegelkasse_report" in cd
        assert ".xlsx" in cd

    def test_export_with_data(self, client, admin_headers, db, club, admin_user):
        """Ensure export works correctly when there is actual data in the DB."""
        import time
        from models.penalty import PenaltyMode
        member = RegularMember(club_id=club.id, name="Export Test Member", is_active=True)
        db.add(member)
        db.flush()
        evening = Evening(club_id=club.id, date=datetime(2025, 3, 1), is_closed=True)
        db.add(evening)
        db.flush()
        player = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name="Export Test Member")
        db.add(player)
        db.flush()
        log = PenaltyLog(
            evening_id=evening.id,
            player_id=player.id,
            player_name="Export Test Member",
            penalty_type_name="Strafe",
            amount=2.0,
            unit_amount=2.0,
            mode=PenaltyMode.euro,
            client_timestamp=time.time() * 1000,
        )
        db.add(log)
        db.commit()
        r = client.get("/api/v1/reports/export?format=xlsx", headers=admin_headers)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"


# ---------------------------------------------------------------------------
# GET /reports/data
# ---------------------------------------------------------------------------

class TestReportData:
    def test_requires_auth(self, client):
        assert client.get("/api/v1/reports/data").status_code == 401

    def test_member_forbidden(self, client, auth_headers):
        assert client.get("/api/v1/reports/data", headers=auth_headers).status_code == 403

    def test_empty_club_has_full_shape(self, client, admin_headers):
        r = client.get("/api/v1/reports/data", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["period_label"] == "Gesamt"
        assert body["summary"]["evenings"] == 0
        assert body["bookings"] == []
        assert body["evenings"] == []
        assert body["monthly"]["months"] == []

    def test_year_sets_period_label(self, client, admin_headers):
        r = client.get("/api/v1/reports/data?year=2025", headers=admin_headers)
        assert r.json()["period_label"] == "2025"

    def test_aggregates_penalties_per_member(self, client, admin_headers, db, club):
        import time
        from models.penalty import PenaltyMode
        member = RegularMember(club_id=club.id, name="Data Member", nickname="Dati", is_active=True)
        db.add(member)
        db.flush()
        evening = Evening(club_id=club.id, date=datetime(2025, 3, 1), venue="Bahn 1", is_closed=True)
        db.add(evening)
        db.flush()
        player = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name="Data Member")
        db.add(player)
        db.flush()
        db.add(PenaltyLog(
            evening_id=evening.id, player_id=player.id, player_name="Data Member",
            penalty_type_name="Strafe", amount=2.5, unit_amount=2.5, mode=PenaltyMode.euro,
            client_timestamp=time.time() * 1000,
        ))
        db.commit()

        body = client.get("/api/v1/reports/data?year=2025", headers=admin_headers).json()

        assert body["summary"]["total_penalties"] == 2.5
        assert body["summary"]["evenings"] == 1
        acct = next(a for a in body["accounts"] if a["name"] == "Data Member")
        assert acct["nickname"] == "Dati"
        assert acct["penalties"] == 2.5
        assert acct["balance"] == -2.5
        assert {"nickname": "Dati", "type": "Strafe", "count": 1, "total": 2.5} in body["penalties_by_person"]
        assert body["evenings"][0]["venue"] == "Bahn 1"
        assert body["evenings"][0]["penalties"] == 2.5
        assert body["monthly"]["months"] == ["Mrz"]
        row = next(m for m in body["monthly"]["regular"] if m["name"] == "Dati")
        assert row["months"] == [2.5]


class TestReportDataCapsAndActive:
    """Guest cap, deactivated members and soft-deleted bookings in GET /reports/data."""

    def _evening_with_penalties(self, db, club, member, amounts, day=1):
        import time
        from models.penalty import PenaltyMode
        evening = Evening(club_id=club.id, date=datetime(2025, 3, day), venue="Bahn", is_closed=True)
        db.add(evening)
        db.flush()
        player = EveningPlayer(evening_id=evening.id, regular_member_id=member.id, name=member.name)
        db.add(player)
        db.flush()
        for a in amounts:
            db.add(PenaltyLog(
                evening_id=evening.id, player_id=player.id, player_name=member.name,
                penalty_type_name="Strafe", amount=a, unit_amount=a, mode=PenaltyMode.euro,
                client_timestamp=time.time() * 1000,
            ))
        db.commit()

    def test_guest_penalties_are_capped_per_evening_everywhere(self, client, admin_headers, db, club):
        from models.club import ClubSettings
        settings = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
        if settings is None:
            settings = ClubSettings(club_id=club.id, extra={})
            db.add(settings)
        settings.extra = {**(settings.extra or {}), "guest_penalty_cap": 5.0}
        guest = RegularMember(club_id=club.id, name="Gast G", is_active=True, is_guest=True)
        db.add(guest)
        db.commit()
        self._evening_with_penalties(db, club, guest, [4.0, 4.0, 4.0], day=1)  # 12 raw -> 5
        self._evening_with_penalties(db, club, guest, [2.0], day=8)  # under the cap -> 2

        body = client.get("/api/v1/reports/data?year=2025", headers=admin_headers).json()

        assert body["summary"]["total_penalties"] == 7.0
        assert [e["penalties"] for e in body["evenings"]] == [2.0, 5.0]
        row = next(m for m in body["monthly"]["guests"] if m["name"] == "Gast G")
        assert row["months"] == [7.0]
        assert row["penalties"] == 7.0
        assert body["monthly"]["guest_penalty_cap"] == 5.0
        db.delete(settings)
        db.commit()

    def test_deactivated_member_not_counted_as_active_but_keeps_account(self, client, admin_headers, db, club):
        db.add_all([
            RegularMember(club_id=club.id, name="Aktiv", is_active=True),
            RegularMember(club_id=club.id, name="Weg", is_active=True, deactivated_at=datetime(2025, 2, 1)),
        ])
        db.commit()
        body = client.get("/api/v1/reports/data", headers=admin_headers).json()
        assert body["summary"]["members"] == 1
        acct = {a["name"]: a for a in body["accounts"]}
        assert acct["Weg"]["deactivated"] is True
        assert acct["Aktiv"]["deactivated"] is False

    def test_deleted_payments_are_excluded(self, client, admin_headers, db, club):
        from models.payment import MemberPayment
        m = RegularMember(club_id=club.id, name="Zahler", is_active=True)
        db.add(m)
        db.flush()
        db.add_all([
            MemberPayment(club_id=club.id, regular_member_id=m.id, amount=10.0),
            MemberPayment(club_id=club.id, regular_member_id=m.id, amount=99.0, is_deleted=True),
        ])
        db.commit()
        body = client.get("/api/v1/reports/data", headers=admin_headers).json()
        assert body["summary"]["total_payments"] == 10.0
        assert len(body["bookings"]) == 1

    def test_kassenstand_is_cash_minus_expenses_like_the_kasse(self, client, admin_headers, db, club):
        from models.payment import MemberPayment, ClubExpense
        m = RegularMember(club_id=club.id, name="Kassierer", is_active=True)
        db.add(m)
        db.flush()
        self._evening_with_penalties(db, club, m, [50.0])
        db.add_all([
            MemberPayment(club_id=club.id, regular_member_id=m.id, amount=100.0),
            MemberPayment(club_id=club.id, regular_member_id=m.id, amount=30.0, is_writeoff=True),
            ClubExpense(club_id=club.id, description="Bahn", amount=40.0),
        ])
        db.commit()
        body = client.get("/api/v1/reports/data", headers=admin_headers).json()
        # open penalties and write-offs are not cash: 100 paid in - 40 expenses
        assert body["summary"]["kassenstand"] == 60.0
        assert body["summary"]["total_payments"] == 100.0
        assert any(b["type"] == "Abschreibung" for b in body["bookings"])

    def test_account_month_balances_are_running_and_in_excel(self, client, admin_headers, db, club):
        import io
        from openpyxl import load_workbook
        from models.payment import MemberPayment
        m = RegularMember(club_id=club.id, name="Konto", is_active=True)
        db.add(m)
        db.flush()
        self._evening_with_penalties(db, club, m, [50.0])
        db.add(MemberPayment(club_id=club.id, regular_member_id=m.id, amount=20.0))
        db.commit()
        body = client.get("/api/v1/reports/data", headers=admin_headers).json()
        acc = next(a for a in body["accounts"] if a["name"] == "Konto")
        assert acc["months"][-1]["balance"] == acc["balance"] == -30.0
        assert sum(x["payments"] for x in acc["months"]) == 20.0
        assert sum(x["penalties"] for x in acc["months"]) == 50.0
        r = client.get("/api/v1/reports/export?format=xlsx", headers=admin_headers)
        wb = load_workbook(io.BytesIO(r.content))
        monthly = [[c.value for c in row] for row in wb["Konten pro Monat"].iter_rows(min_row=2)]
        assert any(row[0] == "Konto" and row[1] == "Einzahlung" for row in monthly)
        schulden = [row for row in monthly if row[1] == "Schulden" and row[0] == ""]
        assert any(sum(v for v in row[2:] if v) == 50.0 for row in schulden)
        assert [c.value for c in wb["Konten pro Monat"][1]][1] == ""
        ws = wb["Mitglieder-Konten"]
        header = [c.value for c in ws[1]]
        assert any(str(h).startswith("Saldo Ende") for h in header)
        assert "Offen (€)" in header

    def test_guest_cap_only_applies_from_the_exit_on(self, client, admin_headers, db, club):
        from models.club import ClubSettings
        settings = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
        if settings is None:
            settings = ClubSettings(club_id=club.id, extra={})
            db.add(settings)
        settings.extra = {**(settings.extra or {}), "guest_penalty_cap": 5.0}
        ex = RegularMember(club_id=club.id, name="Ex", is_active=True, is_guest=True,
                           deactivated_at=datetime(2025, 3, 5))
        db.add(ex)
        db.commit()
        self._evening_with_penalties(db, club, ex, [4.0, 4.0, 4.0], day=1)   # as member: 12 in full
        self._evening_with_penalties(db, club, ex, [4.0, 4.0, 4.0], day=10)  # as guest: capped to 5
        body = client.get("/api/v1/reports/data?year=2025", headers=admin_headers).json()
        assert body["summary"]["total_penalties"] == 17.0
        db.delete(settings)
        db.commit()

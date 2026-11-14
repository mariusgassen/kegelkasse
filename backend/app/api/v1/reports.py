"""
Report export — admin-only endpoints: an Excel (.xlsx) workbook, and the JSON the app
renders into its PDF report (pdfcn/Forme, client-side), covering member accounts, penalties, transactions, and evening summaries.
Supports optional year filtering (omit for all-time).
"""
import io
import logging
from collections import defaultdict
from datetime import date, datetime, timezone
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from api.deps import require_club_admin
from core.database import get_db
from models.club import Club
from models.evening import Evening, EveningPlayer, RegularMember
from models.game import Game
from models.payment import ClubExpense, MemberPayment
from models.penalty import PenaltyLog
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])

_MONTH_ABB_DE = ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

# ── Styling helpers ──────────────────────────────────────────────────────────

_HEADER_FILL = PatternFill("solid", fgColor="1E293B")
_ALT_FILL = PatternFill("solid", fgColor="0F172A")
_HEADER_FONT = Font(bold=True, color="E2E8F0")
_TOTAL_FONT = Font(bold=True, color="F1F5F9")
_TOTAL_FILL = PatternFill("solid", fgColor="334155")


def _write_header(ws, cols: list[str]) -> None:
    """Write a styled header row to the worksheet."""
    for ci, title in enumerate(cols, start=1):
        cell = ws.cell(row=1, column=ci, value=title)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 20


def _auto_width(ws, min_w: int = 10, max_w: int = 50) -> None:
    """Auto-size all columns based on their content."""
    for col_cells in ws.columns:
        length = max(len(str(c.value or "")) for c in col_cells)
        ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(max(length + 2, min_w), max_w)


def _fmt_date(dt: Optional[datetime]) -> str:
    if dt is None:
        return ""
    return dt.strftime("%d.%m.%Y")


def _fmt_euro(v: float) -> str:
    return f"{v:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def _penalty_euro(log: PenaltyLog) -> float:
    if log.mode == "euro":
        return log.amount
    if log.unit_amount is not None:
        return log.amount * log.unit_amount
    return 0.0


_REPORT_FIELDS = {'guest_penalty_cap', 'club_name', 'member_by_id', 'evenings', 'evening_by_id', 'player_by_id', 'penalty_logs', 'period_label', 'total_penalties', 'total_payments', 'total_expenses', 'kassenstand', 'regular_members', 'member_penalty_total', 'payments_by_member', 'booking_rows', 'pen_by_member_type', 'penalty_per_evening', 'players_per_evening', 'games_per_evening', 'king_per_evening', 'monthly_pen_by_member', 'sorted_months', 'guest_members', '_month_label', 'monthly_pay_by_member', 'account_months'}


def _collect_report(db: Session, user: User, year: Optional[int]) -> SimpleNamespace:
    """Load and aggregate everything the Excel export and the PDF data endpoint share."""
    club = db.query(Club).filter(Club.id == user.club_id).first()
    club_name = club.name if club else "Kegelclub"
    settings = club.settings if club else None
    guest_penalty_cap: Optional[float] = (settings.extra or {}).get("guest_penalty_cap") if settings else None

    # ── Load base data ────────────────────────────────────────────────────────

    members = (
        db.query(RegularMember)
        .filter(RegularMember.club_id == user.club_id, RegularMember.is_active == True)
        .order_by(RegularMember.is_guest, RegularMember.name)
        .all()
    )
    member_by_id: dict[int, RegularMember] = {m.id: m for m in members}

    # Evenings (optionally year-filtered)
    evening_q = db.query(Evening).filter(Evening.club_id == user.club_id)
    if year:
        evening_q = evening_q.filter(
            Evening.date >= datetime(year, 1, 1, tzinfo=timezone.utc),
            Evening.date < datetime(year + 1, 1, 1, tzinfo=timezone.utc),
        )
    evenings = evening_q.order_by(Evening.date).all()
    evening_ids = [e.id for e in evenings]
    evening_by_id: dict[int, Evening] = {e.id: e for e in evenings}

    # EveningPlayers for these evenings
    players_in_scope = (
        db.query(EveningPlayer)
        .filter(EveningPlayer.evening_id.in_(evening_ids))
        .all()
    ) if evening_ids else []
    player_by_id: dict[int, EveningPlayer] = {p.id: p for p in players_in_scope}

    # PenaltyLog for these evenings (non-deleted)
    penalty_logs = (
        db.query(PenaltyLog)
        .filter(PenaltyLog.evening_id.in_(evening_ids), PenaltyLog.is_deleted == False)
        .order_by(PenaltyLog.evening_id, PenaltyLog.id)
        .all()
    ) if evening_ids else []

    # Payments (optionally year-filtered)
    payment_q = db.query(MemberPayment).filter(MemberPayment.club_id == user.club_id, MemberPayment.is_deleted == False)
    if year:
        payment_q = payment_q.filter(or_(
            and_(MemberPayment.date.isnot(None), MemberPayment.date >= date(year, 1, 1), MemberPayment.date < date(year + 1, 1, 1)),
            and_(
                MemberPayment.date.is_(None),
                MemberPayment.created_at >= datetime(year, 1, 1, tzinfo=timezone.utc),
                MemberPayment.created_at < datetime(year + 1, 1, 1, tzinfo=timezone.utc),
            ),
        ))
    payments = payment_q.order_by(MemberPayment.created_at).all()

    # Expenses (optionally year-filtered)
    expense_q = db.query(ClubExpense).filter(ClubExpense.club_id == user.club_id, ClubExpense.is_deleted == False)
    if year:
        expense_q = expense_q.filter(or_(
            and_(ClubExpense.date.isnot(None), ClubExpense.date >= date(year, 1, 1), ClubExpense.date < date(year + 1, 1, 1)),
            and_(
                ClubExpense.date.is_(None),
                ClubExpense.created_at >= datetime(year, 1, 1, tzinfo=timezone.utc),
                ClubExpense.created_at < datetime(year + 1, 1, 1, tzinfo=timezone.utc),
            ),
        ))
    expenses = expense_q.order_by(ClubExpense.created_at).all()

    # Games for these evenings
    games = (
        db.query(Game)
        .filter(Game.evening_id.in_(evening_ids), Game.is_deleted == False)
        .all()
    ) if evening_ids else []

    # ── Build aggregated lookups ──────────────────────────────────────────────

    # Guests pay at most `guest_penalty_cap` per evening and no absence penalties (same rule as the
    # Kasse's guest balances). Every aggregate below uses this effective amount so the report's
    # evening, monthly and account figures agree with each other and with the Kasse.
    guest_ids = {
        mid for (mid,) in db.query(RegularMember.id).filter(
            RegularMember.club_id == user.club_id, RegularMember.is_guest == True
        )
    }

    def _log_member_id(log: PenaltyLog) -> Optional[int]:
        if log.player_id is not None:
            ep = player_by_id.get(log.player_id)
            return ep.regular_member_id if ep else None
        return log.regular_member_id

    # The cap only applies from a former member's exit on; earlier evenings were played as a regular
    # member (uncapped, absence penalties included).
    from app.api.v1.club import _before_leave

    def _as_guest(mid: Optional[int], log: PenaltyLog) -> bool:
        if mid not in guest_ids:
            return False
        ev = evening_by_id.get(log.evening_id)
        m = member_by_id.get(mid)
        return not (ev and m and _before_leave(ev.date, m.deactivated_at))

    guest_raw: dict[tuple[int, int], float] = defaultdict(float)
    for log in penalty_logs:
        mid = _log_member_id(log)
        if _as_guest(mid, log) and log.player_id is not None:
            guest_raw[(mid, log.evening_id)] += _penalty_euro(log)

    def effective_euro(log: PenaltyLog) -> float:
        euro = _penalty_euro(log)
        mid = _log_member_id(log)
        if not _as_guest(mid, log):
            return euro
        if log.player_id is None:
            return 0.0
        raw = guest_raw[(mid, log.evening_id)]
        if guest_penalty_cap is not None and raw > guest_penalty_cap:
            return euro * guest_penalty_cap / raw
        return euro

    # penalty euro per player_id and per regular_member_id (absences)
    penalty_by_player: dict[int, float] = {}
    penalty_by_member_absence: dict[int, float] = {}
    for log in penalty_logs:
        euro = effective_euro(log)
        if log.player_id is not None:
            penalty_by_player[log.player_id] = penalty_by_player.get(log.player_id, 0.0) + euro
        elif log.regular_member_id is not None:
            penalty_by_member_absence[log.regular_member_id] = (
                penalty_by_member_absence.get(log.regular_member_id, 0.0) + euro
            )

    # map regular_member_id → list of player_ids (in scope)
    member_player_ids: dict[int, list[int]] = {}
    for p in players_in_scope:
        if p.regular_member_id is not None:
            member_player_ids.setdefault(p.regular_member_id, []).append(p.id)

    def member_penalty_total(mid: int) -> float:
        total = sum(penalty_by_player.get(pid, 0.0) for pid in member_player_ids.get(mid, []))
        total += penalty_by_member_absence.get(mid, 0.0)
        return round(total, 2)

    payments_by_member: dict[int, float] = {}
    for p in payments:
        payments_by_member[p.regular_member_id] = payments_by_member.get(p.regular_member_id, 0.0) + p.amount

    # king per evening: player that has is_king=True
    king_per_evening: dict[int, str] = {}
    for p in players_in_scope:
        if p.is_king:
            king_per_evening[p.evening_id] = p.name

    # games per evening count
    games_per_evening: dict[int, int] = {}
    for g in games:
        games_per_evening[g.evening_id] = games_per_evening.get(g.evening_id, 0) + 1

    # penalty total per evening
    penalty_per_evening: dict[int, float] = {}
    for log in penalty_logs:
        eid = log.evening_id
        penalty_per_evening[eid] = penalty_per_evening.get(eid, 0.0) + effective_euro(log)

    # players per evening count
    players_per_evening: dict[int, int] = {}
    for p in players_in_scope:
        players_per_evening[p.evening_id] = players_per_evening.get(p.evening_id, 0) + 1

    # ── Shared derived data (used by both Excel and PDF) ──────────────────────

    period_label = str(year) if year else "Gesamt"
    total_penalties = round(sum(effective_euro(l) for l in penalty_logs), 2)
    # Cash actually paid in: write-offs settle a balance without any money moving.
    total_payments = round(sum(p.amount for p in payments if not p.is_writeoff), 2)
    total_expenses = round(sum(e.amount for e in expenses), 2)
    # Same definition as the Kasse: real money in the till (cash paid in − expenses). Open penalties
    # are not cash.
    kassenstand = round(total_payments - total_expenses, 2)
    regular_members = [m for m in members if not m.is_guest]

    # Bookings: payments + expenses merged and sorted by date
    booking_rows: list[tuple[Optional[datetime], str, str, float, str]] = []
    for p in payments:
        m = member_by_id.get(p.regular_member_id)
        name = (m.nickname or m.name) if m else f"#{p.regular_member_id}"
        booking_rows.append((p.date or p.created_at, "Abschreibung" if p.is_writeoff else "Einzahlung", name, p.amount, p.note or ""))
    for e in expenses:
        dt = e.date or e.created_at
        booking_rows.append((dt, "Ausgabe", e.description, -e.amount, ""))
    def _to_dt(v):
        if v is None:
            return datetime.min
        if isinstance(v, datetime):
            return v.replace(tzinfo=None) if v.tzinfo else v
        # datetime.date → convert to datetime
        return datetime(v.year, v.month, v.day)

    booking_rows.sort(key=lambda r: _to_dt(r[0]))

    # per (member_id, penalty_type_name) → (count, total_euro)
    pen_by_member_type: dict[tuple[int, str], tuple[int, float]] = {}
    for log in penalty_logs:
        if log.player_id is not None:
            ep = player_by_id.get(log.player_id)
            mid = ep.regular_member_id if ep else None
        else:
            mid = log.regular_member_id
        if mid is None:
            continue
        key = (mid, log.penalty_type_name or "Unbekannt")
        cnt, tot = pen_by_member_type.get(key, (0, 0.0))
        pen_by_member_type[key] = (cnt + 1, round(tot + effective_euro(log), 2))

    # Monthly penalties per member: {member_id: {(year, month): total_euro}}
    monthly_pen_by_member: dict[int, dict[tuple[int, int], float]] = defaultdict(lambda: defaultdict(float))
    for log in penalty_logs:
        ev = evening_by_id.get(log.evening_id)
        if ev is None:
            continue
        ym = (ev.date.year, ev.date.month)
        euro = effective_euro(log)
        if log.player_id is not None:
            ep = player_by_id.get(log.player_id)
            mid = ep.regular_member_id if ep else None
        else:
            mid = log.regular_member_id
        if mid is not None:
            monthly_pen_by_member[mid][ym] += euro

    all_months_set: set[tuple[int, int]] = set()
    for by_month in monthly_pen_by_member.values():
        all_months_set.update(by_month.keys())
    sorted_months = sorted(all_months_set)
    single_year = len({ym[0] for ym in sorted_months}) <= 1

    def _month_label(ym: tuple[int, int]) -> str:
        label = _MONTH_ABB_DE[ym[1] - 1]
        return label if single_year else f"{label} '{ym[0] % 100:02d}"

    # Payments per member and month (write-offs included: they settle the balance), so the accounts
    # can show a running balance at the end of every month.
    monthly_pay_by_member: dict[int, dict[tuple[int, int], float]] = defaultdict(lambda: defaultdict(float))
    for p in payments:
        pdt = p.date or p.created_at
        if pdt is not None:
            monthly_pay_by_member[p.regular_member_id][(pdt.year, pdt.month)] += p.amount
    account_months_set = set(all_months_set)
    for by_month in monthly_pay_by_member.values():
        account_months_set.update(by_month.keys())
    account_months = sorted(account_months_set)

    # Guests with any penalty activity in scope
    guest_members = [m for m in members if m.is_guest and m.id in monthly_pen_by_member]


    return SimpleNamespace(**{k: v for k, v in locals().items() if k in _REPORT_FIELDS})


# ── Main export endpoint ──────────────────────────────────────────────────────

@router.get("/data")
def report_data(
    year: Optional[int] = Query(None, description="Filter to a specific year; omit for all-time"),
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """JSON behind the PDF report (admin only). The app renders it into a PDF client-side."""
    d = _collect_report(db, user, year)

    def _name(m: RegularMember) -> str:
        return m.nickname or m.name

    def _date_str(v) -> str:
        return _fmt_date(v) if isinstance(v, datetime) else (v.strftime("%d.%m.%Y") if v else "")

    def _acc_month_label(ym, d_):
        single = len({y for y, _ in d_.account_months}) <= 1
        label = _MONTH_ABB_DE[ym[1] - 1]
        return label if single else f"{label} '{ym[0] % 100:02d}"

    accounts = []
    for m in d.regular_members:
        pen = d.member_penalty_total(m.id)
        pay = round(d.payments_by_member.get(m.id, 0.0), 2)
        run, months_detail = 0.0, []
        for ym in d.account_months:
            pay_m = round(d.monthly_pay_by_member[m.id].get(ym, 0.0), 2)
            pen_m = round(d.monthly_pen_by_member[m.id].get(ym, 0.0), 2)
            run += pay_m - pen_m
            months_detail.append({"month": _acc_month_label(ym, d), "payments": pay_m,
                                  "penalties": pen_m, "balance": round(run, 2)})
        accounts.append({"nickname": _name(m), "name": m.name, "penalties": pen, "payments": pay,
                         "balance": round(pay - pen, 2), "deactivated": m.deactivated_at is not None,
                         "months": months_detail})

    by_person = []
    for m in d.regular_members:
        entries = sorted(
            ((k[1], v[0], v[1]) for k, v in d.pen_by_member_type.items() if k[0] == m.id),
            key=lambda x: x[0],
        )
        for pname, cnt, total in entries:
            by_person.append({"nickname": _name(m), "type": pname, "count": cnt, "total": total})

    def _monthly_row(m: RegularMember) -> dict:
        pen = d.member_penalty_total(m.id)
        pay = round(d.payments_by_member.get(m.id, 0.0), 2)
        return {
            "name": _name(m),
            "months": [round(d.monthly_pen_by_member[m.id].get(ym, 0.0), 2) for ym in d.sorted_months],
            "penalties": pen, "payments": pay, "balance": round(pay - pen, 2),
        }

    logger.info("PDF report data generated: club=%d user=%d year=%s", user.club_id, user.id, year)
    return {
        "club_name": d.club_name,
        "period_label": d.period_label,
        "generated_at": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "summary": {
            "total_penalties": d.total_penalties,
            "total_payments": d.total_payments,
            "total_expenses": d.total_expenses,
            "kassenstand": d.kassenstand,
            "evenings": len(d.evenings),
            "members": sum(1 for m in d.regular_members if m.deactivated_at is None),
        },
        "accounts": accounts,
        "bookings": [
            {"date": _date_str(dt), "type": typ, "description": desc, "amount": amt, "note": note}
            for dt, typ, desc, amt, note in d.booking_rows
        ],
        "penalties_by_person": by_person,
        "evenings": [
            {
                "date": _fmt_date(ev.date), "venue": ev.venue or "", "closed": bool(ev.is_closed),
                "players": d.players_per_evening.get(ev.id, 0), "games": d.games_per_evening.get(ev.id, 0),
                "penalties": round(d.penalty_per_evening.get(ev.id, 0.0), 2),
                "king": d.king_per_evening.get(ev.id, ""),
            }
            for ev in reversed(d.evenings)
        ],
        "monthly": {
            "months": [d._month_label(ym) for ym in d.sorted_months],
            "guest_penalty_cap": d.guest_penalty_cap,
            "regular": [_monthly_row(m) for m in d.regular_members],
            "guests": [_monthly_row(m) for m in d.guest_members],
        },
    }


@router.get("/export")
def export_report(
    year: Optional[int] = Query(None, description="Filter to a specific year; omit for all-time"),
    fmt: str = Query("xlsx", alias="format", description="Output format: xlsx (the PDF report is built in the app from GET /reports/data)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_club_admin),
):
    """Download the Excel report for the club (admin only)."""
    if fmt != "xlsx":
        raise HTTPException(400, "format must be 'xlsx' (PDF is built in the app from /reports/data)")
    d = _collect_report(db, user, year)
    club_name = d.club_name
    member_by_id = d.member_by_id
    evenings = d.evenings
    evening_by_id = d.evening_by_id
    player_by_id = d.player_by_id
    penalty_logs = d.penalty_logs
    period_label = d.period_label
    total_penalties = d.total_penalties
    total_payments = d.total_payments
    total_expenses = d.total_expenses
    kassenstand = d.kassenstand
    regular_members = d.regular_members
    member_penalty_total = d.member_penalty_total
    payments_by_member = d.payments_by_member
    booking_rows = d.booking_rows
    pen_by_member_type = d.pen_by_member_type
    penalty_per_evening = d.penalty_per_evening
    players_per_evening = d.players_per_evening
    games_per_evening = d.games_per_evening
    king_per_evening = d.king_per_evening
    monthly_pen_by_member = d.monthly_pen_by_member
    sorted_months = d.sorted_months
    guest_members = d.guest_members
    _month_label = d._month_label
    monthly_pay_by_member = d.monthly_pay_by_member
    account_months = d.account_months
    year_suffix = f"_{year}" if year else ""

    # ── Excel output ──────────────────────────────────────────────────────────

    wb = Workbook()
    wb.remove(wb.active)  # remove default empty sheet

    # ── Sheet 1: Übersicht ────────────────────────────────────────────────────

    ws1 = wb.create_sheet("Übersicht")
    ws1.freeze_panes = "A2"

    ws1.cell(1, 1, "Vereinskasse — Bericht").font = Font(bold=True, size=14)
    ws1.cell(2, 1, "Verein").font = Font(bold=True)
    ws1.cell(2, 2, club_name)
    ws1.cell(3, 1, "Zeitraum").font = Font(bold=True)
    ws1.cell(3, 2, period_label)
    ws1.cell(4, 1, "Erstellt am").font = Font(bold=True)
    ws1.cell(4, 2, datetime.now().strftime("%d.%m.%Y %H:%M"))
    ws1.cell(5, 1, "")

    stats = [
        ("Strafen (gesamt)", _fmt_euro(total_penalties)),
        ("Einzahlungen (gesamt)", _fmt_euro(total_payments)),
        ("Ausgaben (gesamt)", _fmt_euro(total_expenses)),
        ("Kassenstand", _fmt_euro(kassenstand)),
        ("", ""),
        ("Abende", str(len(evenings))),
        ("Mitglieder (aktiv)", str(sum(1 for m in regular_members if m.deactivated_at is None))),
    ]
    for ri, (label, value) in enumerate(stats, start=6):
        ws1.cell(ri, 1, label).font = Font(bold=True)
        ws1.cell(ri, 2, value)

    ws1.column_dimensions["A"].width = 26
    ws1.column_dimensions["B"].width = 20

    # ── Sheet 2: Mitglieder-Konten ────────────────────────────────────────────

    ws2 = wb.create_sheet("Mitglieder-Konten")
    ws2.freeze_panes = "A2"
    month_names_full = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
    single_acc_year = len({ym[0] for ym in account_months}) <= 1

    def _acc_label(ym: tuple[int, int]) -> str:
        label = _MONTH_ABB_DE[ym[1] - 1]
        return label if single_acc_year else f"{label} '{ym[0] % 100:02d}"

    cols2 = ["Kegelname", "Name", "Strafen (€)", "Einzahlungen (€)", "Saldo (€)", "Offen (€)"] + [
        f"Saldo Ende {_acc_label(ym)}" for ym in account_months
    ]
    _write_header(ws2, cols2)
    euro_fmt = '#,##0.00 "€"'

    def _running(mid: int) -> list[float]:
        bal, out = 0.0, []
        for ym in account_months:
            bal += monthly_pay_by_member[mid].get(ym, 0.0) - monthly_pen_by_member[mid].get(ym, 0.0)
            out.append(round(bal, 2))
        return out

    for ri, m in enumerate(regular_members, start=2):
        display = (m.nickname or m.name) + (" (deaktiviert)" if m.deactivated_at is not None else "")
        pen = member_penalty_total(m.id)
        pay = round(payments_by_member.get(m.id, 0.0), 2)
        bal = round(pay - pen, 2)
        row = [display, m.name, pen, pay, bal, round(-bal, 2) if bal < 0 else 0.0] + _running(m.id)
        for ci, val in enumerate(row, start=1):
            cell = ws2.cell(ri, ci, val)
            if ci >= 3:
                cell.number_format = euro_fmt
                if ci == 5 or ci >= 7:
                    cell.font = Font(color="FF4444" if val < 0 else "4ADE80")
                elif ci == 6 and val:
                    cell.font = Font(color="FF4444", bold=True)

    tr = len(regular_members) + 2
    tot_pen = round(sum(member_penalty_total(m.id) for m in regular_members), 2)
    tot_pay = round(sum(payments_by_member.get(m.id, 0.0) for m in regular_members), 2)
    tot_open = round(sum(max(0.0, -round(payments_by_member.get(m.id, 0.0) - member_penalty_total(m.id), 2)) for m in regular_members), 2)
    running_all = [_running(m.id) for m in regular_members]
    totals = [None, None, tot_pen, tot_pay, round(tot_pay - tot_pen, 2), tot_open] + [
        round(sum(r[i] for r in running_all), 2) for i in range(len(account_months))
    ]
    ws2.cell(tr, 1, "GESAMT")
    for ci in range(1, len(cols2) + 1):
        c = ws2.cell(tr, ci)
        if ci >= 3:
            c.value = totals[ci - 1]
            c.number_format = euro_fmt
        c.font = _TOTAL_FONT
        c.fill = _TOTAL_FILL
    _auto_width(ws2)

    ws2b = wb.create_sheet("Konten pro Monat")
    ws2b.freeze_panes = "C2"
    _write_header(ws2b, ["Konto", ""] + [f"{month_names_full[ym[1] - 1]} {ym[0]}" for ym in account_months])
    rb = 2
    for m in regular_members:
        run = 0.0
        pays, pens, bals = [], [], []
        for ym in account_months:
            pay_m = round(monthly_pay_by_member[m.id].get(ym, 0.0), 2)
            pen_m = round(monthly_pen_by_member[m.id].get(ym, 0.0), 2)
            run += pay_m - pen_m
            pays.append(pay_m)
            pens.append(pen_m)
            bals.append(round(run, 2))
        display = (m.nickname or m.name) + (" (deaktiviert)" if m.deactivated_at is not None else "")
        for kind, vals in (("Einzahlung", pays), ("Schulden", pens), ("Saldo", bals)):
            ws2b.cell(rb, 1, display if kind == "Einzahlung" else "")
            ws2b.cell(rb, 2, kind)
            for ci, v in enumerate(vals, start=3):
                c = ws2b.cell(rb, ci, v)
                c.number_format = euro_fmt
                if kind == "Saldo":
                    c.font = Font(color="FF4444" if v < 0 else "4ADE80")
            rb += 1
    _auto_width(ws2b)

    # ── Sheet 3: Buchungen ────────────────────────────────────────────────────

    ws3 = wb.create_sheet("Buchungen")
    ws3.freeze_panes = "A2"
    _write_header(ws3, ["Datum", "Typ", "Mitglied / Beschreibung", "Betrag (€)", "Notiz / Buchungstext"])

    ri = 2
    prev_ym = "init"
    month_names = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]

    def _month_net(ym) -> float:
        return round(sum(
            a for (d_, t_, _, a, _) in booking_rows
            if t_ != "Abschreibung" and d_ is not None and (d_.year, d_.month) == ym
        ), 2)

    for dt, typ, desc, amt, note in booking_rows:
        ym = (dt.year, dt.month) if dt is not None else None
        if ym != prev_ym:
            label = f"{month_names[ym[1] - 1]} {ym[0]}" if ym else "Ohne Datum"
            for ci in range(1, 6):
                ws3.cell(ri, ci).fill = _TOTAL_FILL
                ws3.cell(ri, ci).font = _TOTAL_FONT
            ws3.cell(ri, 1, label)
            if ym:
                ws3.cell(ri, 4, _month_net(ym)).number_format = '#,##0.00 "€"'
                ws3.cell(ri, 5, "Netto bar")
            ri += 1
            prev_ym = ym
        ws3.cell(ri, 1, _fmt_date(dt))
        ws3.cell(ri, 2, typ)
        ws3.cell(ri, 3, desc)
        cell_amt = ws3.cell(ri, 4, amt)
        cell_amt.number_format = '#,##0.00 "€"'
        if typ == "Abschreibung":
            cell_amt.font = Font(color="94A3B8")
        elif amt < 0:
            cell_amt.font = Font(color="FF4444")
        ws3.cell(ri, 5, note)
        ri += 1

    _auto_width(ws3)

    # ── Sheet 4: Strafen nach Person ──────────────────────────────────────────

    ws4 = wb.create_sheet("Strafen nach Person")
    ws4.freeze_panes = "A2"
    type_totals: dict[str, float] = {}
    for (_mid, tname), (_, tot_) in pen_by_member_type.items():
        type_totals[tname] = round(type_totals.get(tname, 0.0) + tot_, 2)
    types_sorted = sorted(type_totals, key=lambda t: (-type_totals[t], t))
    _write_header(ws4, ["Kegelname", "Summe (€)"] + types_sorted)
    max_fill = PatternFill("solid", fgColor="FECACA")
    min_fill = PatternFill("solid", fgColor="BBF7D0")

    people = [m for m in regular_members if any(k[0] == m.id for k in pen_by_member_type)]
    people.sort(key=lambda m: -sum(v[1] for k, v in pen_by_member_type.items() if k[0] == m.id))
    extremes: dict[str, tuple[float, float]] = {}
    for t in types_sorted:
        nz = [v for v in (pen_by_member_type.get((m.id, t), (0, 0.0))[1] for m in people) if v > 0]
        if len(set(nz)) >= 2:
            extremes[t] = (max(nz), min(nz))
    for ri, m in enumerate(people, start=2):
        ws4.cell(ri, 1, (m.nickname or m.name) + (" (deaktiviert)" if m.deactivated_at is not None else ""))
        tot_m = round(sum(v[1] for k, v in pen_by_member_type.items() if k[0] == m.id), 2)
        ws4.cell(ri, 2, tot_m).number_format = '#,##0.00 "€"'
        for ci, t in enumerate(types_sorted, start=3):
            v = pen_by_member_type.get((m.id, t), (0, 0.0))[1]
            cell = ws4.cell(ri, ci, v if v else "")
            if v:
                cell.number_format = '#,##0.00 "€"'
                if t in extremes:
                    if v == extremes[t][0]:
                        cell.fill, cell.font = max_fill, Font(bold=True, color="991B1B")
                    elif v == extremes[t][1]:
                        cell.fill, cell.font = min_fill, Font(bold=True, color="166534")
    ws4.cell(len(people) + 3, 1, "Rot = höchster, grün = niedrigster Wert je Strafenart (nur wenn mindestens zwei Personen sie hatten).")
    _auto_width(ws4)

    # ── Sheet 5: Strafen nach Abend ───────────────────────────────────────────

    ws5 = wb.create_sheet("Strafen nach Abend")
    ws5.freeze_panes = "A2"
    _write_header(ws5, ["Datum", "Abend", "Mitglied", "Strafen-Typ", "Modus", "Anzahl", "Betrag (€)"])

    for log in penalty_logs:
        ev = evening_by_id.get(log.evening_id)
        if log.player_id is not None:
            ep = player_by_id.get(log.player_id)
            member_name = ep.name if ep else log.player_name or ""
        else:
            m = member_by_id.get(log.regular_member_id) if log.regular_member_id else None
            member_name = (m.nickname or m.name) if m else (log.player_name or "")
        ws5.cell(ws5.max_row + 1 if ws5.max_row > 1 else 2, 1)
        row_idx = ws5.max_row if ws5.max_row > 1 else 2
        ws5.cell(row_idx, 1, _fmt_date(ev.date) if ev else "")
        ws5.cell(row_idx, 2, ev.venue or "" if ev else "")
        ws5.cell(row_idx, 3, member_name)
        ws5.cell(row_idx, 4, log.penalty_type_name or "")
        ws5.cell(row_idx, 5, log.mode or "")
        ws5.cell(row_idx, 6, int(log.amount) if log.mode == "count" else "")
        ws5.cell(row_idx, 7, round(_penalty_euro(log), 2)).number_format = '#,##0.00 "€"'

    _auto_width(ws5)

    # ── Sheet 6: Abende ───────────────────────────────────────────────────────

    ws6 = wb.create_sheet("Abende")
    ws6.freeze_panes = "A2"
    _write_header(ws6, ["Datum", "Ort", "Status", "Spieler", "Spiele", "Strafen (€)", "König"])

    for ri, ev in enumerate(reversed(evenings), start=2):
        ws6.cell(ri, 1, _fmt_date(ev.date))
        ws6.cell(ri, 2, ev.venue or "")
        ws6.cell(ri, 3, "Archiviert" if ev.is_closed else "Offen")
        ws6.cell(ri, 4, players_per_evening.get(ev.id, 0))
        ws6.cell(ri, 5, games_per_evening.get(ev.id, 0))
        ws6.cell(ri, 6, round(penalty_per_evening.get(ev.id, 0.0), 2)).number_format = '#,##0.00 "€"'
        ws6.cell(ri, 7, king_per_evening.get(ev.id, ""))

    _auto_width(ws6)

    # ── Sheet 7: Monatsübersicht ──────────────────────────────────────────────

    ws7 = wb.create_sheet("Monatsübersicht")
    ws7.freeze_panes = "B2"
    month_cols = [_month_label(ym) for ym in sorted_months]
    _write_header(ws7, ["Spieler"] + month_cols + ["Strafen Ges.", "Einzahlungen", "Kontostand"])

    def _write_monthly_row(ws, ri: int, m, label_override: str = "") -> None:
        display = label_override or (m.nickname or m.name)
        ws.cell(ri, 1, display)
        for ci, ym in enumerate(sorted_months, start=2):
            v = round(monthly_pen_by_member[m.id].get(ym, 0.0), 2)
            cell = ws.cell(ri, ci, v if v else "")
            if v:
                cell.number_format = '#,##0.00 "€"'
        base = len(sorted_months)
        pen = member_penalty_total(m.id)
        pay = round(payments_by_member.get(m.id, 0.0), 2)
        ws.cell(ri, base + 2, pen).number_format = '#,##0.00 "€"'
        ws.cell(ri, base + 3, pay).number_format = '#,##0.00 "€"'
        ws.cell(ri, base + 4, round(pay - pen, 2)).number_format = '#,##0.00 "€"'

    ri7 = 2
    # Stammspieler section header
    if regular_members:
        h_cell = ws7.cell(ri7, 1, "— Stammspieler —")
        h_cell.font = Font(bold=True, color="E8A020")
        ri7 += 1
        for m in regular_members:
            _write_monthly_row(ws7, ri7, m)
            ri7 += 1

    # Guests section header
    if guest_members:
        ws7.cell(ri7, 1, "")
        ri7 += 1
        h_cell = ws7.cell(ri7, 1, "— Gäste —")
        h_cell.font = Font(bold=True, color="E8A020")
        ri7 += 1
        for m in guest_members:
            _write_monthly_row(ws7, ri7, m)
            ri7 += 1

    _auto_width(ws7)

    # ── Stream Excel ──────────────────────────────────────────────────────────
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"kegelkasse_report{year_suffix}.xlsx"
    logger.info("Excel report generated: club=%d user=%d year=%s", user.club_id, user.id, year)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

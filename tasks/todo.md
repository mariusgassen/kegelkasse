# Treasury: edit bookings (payments + expenses)

Currently treasury bookings (MemberPayment, ClubExpense) can only be cancelled
(soft-delete). Add editing.

## Plan

- [x] Migration 048: `updated_at` / `updated_by` audit columns on
      `member_payment` + `club_expense`
- [x] Models: add the two columns to `MemberPayment` and `ClubExpense`
- [x] Backend: `PATCH /club/member-payments/{pid}` (amount, note) and
      `PATCH /club/expenses/{eid}` (amount, description, date) — admin only,
      validate amount != 0, 404 for deleted/unknown, push notify member on
      payment amount change, expose `updated_at` in list serializations
- [x] API client: `updateMemberPayment`, `updateExpense`
- [x] TreasuryPage: ✏️ edit button on booking rows (bookings tab payment +
      expense rows, accounts-tab payment history) opening an edit sheet
      (direction toggle, amount, note/description, date for expenses);
      invalidate same queries as delete; show small ✏️ edited marker
- [x] i18n: `treasury.booking.edit`, `treasury.booking.edited` (de + en)
- [x] Tests: pytest for both PATCH endpoints (17 tests: happy, partial edit,
      note/date clearing, 400, 403, 401, 404, push); Vitest for client
      methods (2) + TreasuryPage edit flow (5)
- [x] Docs: docs/docs/funktionen/kasse.md, README, CLAUDE.md roadmap row #3
- [x] Version bump 1.17.0 → 1.18.0 in frontend/package.json (+ lockfile)
- [x] Verification: `npm run build` clean, full Vitest suite 1816/1816,
      full pytest suite 797/797, `ruff check app/` clean

## Review

- Editing is an in-place update with an audit trail (`updated_at`,
  `updated_by` via migration 048) rather than delete+recreate, so booking IDs
  and `created_at` ordering stay stable for the balance-history graph and
  transfer pairs.
- The edit sheet mirrors the "+ Buchung" sheet (direction toggle, amount,
  note/description, date for club expenses) but with the target fixed — a
  payment cannot be moved to another member; that stays cancel + re-book.
- Members get a push ("✏️ Buchung geändert", old → new amount) only when the
  amount actually changes, matching the existing cancel notification.
- Empty note clears a payment note; empty date clears an expense's backdate;
  blank expense description and amount 0 are rejected with 400.

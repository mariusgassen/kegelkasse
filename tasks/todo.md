# UI/UX Improvements Roadmap

Covers all 5 categories from the UI/UX recommendation pass: cheap bugs,
navigation/discoverability, consistency, accessibility, responsiveness.

This file is the roadmap only — implementation has not started. Each item
below traces back to a concrete file:line finding from the codebase survey.

## Decisions (confirmed with user)

- Roadmap covers every finding from the survey, not a subset.
- Roadmap is written first; implementation starts only after this is reviewed.

## Plan

### 1. Cheap bugs ✅ done

- [x] **`--kce-amber` CSS var never declared.** Declared `--kce-amber: var(--kce-primary)`
  in `:root` in `frontend/src/index.css`, so all existing `var(--kce-amber)`
  references across `StatsPage.tsx`, `TabletQuickEntryPage.tsx`,
  `CameraCapturePage.tsx`, `ProtocolPage.tsx`, `GamesPage.tsx`,
  `CommitteePage.tsx`, `ClubAdminPage.tsx`, `ProfileSheet.tsx` now resolve.
- [x] **Hardcoded hex duplicating tokens.** Replaced the 4 exact `#e8a020`
  duplicates of `--kce-primary` in `StatsPage.tsx` (gold-podium gradient end
  stop ×3, "Ich" tspan fill, gold border color) with `var(--kce-primary)`.
  Left the `#c4701a` gradient *start* stops as-is — they're a distinct darker
  shade with no corresponding token, not a duplicate; replacing them would
  have collapsed the gradient into a flat fill.
- [x] **Hardcoded strings bypassing i18n.** `ClubAdminPage.tsx`'s backup-empty
  state and per-backup error badge now use the existing (previously unused)
  `backup.empty` / `backup.error` keys; `StatsPage.tsx`'s loading state now
  reuses `action.loading`. Also found and fixed a 4th instance in the same
  category while in the file: `ClubAdminPage.tsx`'s broadcast-push catch
  block hardcoded `'Fehler beim Senden'` instead of using `t()` — added new
  `broadcast.error` key to `de.ts`/`en.ts`.

### 2. Navigation / discoverability

- [ ] **`EveningPage` (team/player management, close evening) has no visible
  nav entry.** Currently only reachable via the small "AKTIV" header pill
  (`App.tsx:366-373`), mounted at a hidden `'config'` route
  (`App.tsx:43-146,433-445`). Add a proper nav entry point for admins managing
  an active evening.
- [ ] **`MembersPage` (roster, avatars, pins) unreachable for regular members.**
  Only nested inside `ClubAdminPage.tsx:89-93`, and the "club" nav tab is
  hidden entirely for non-admins (`App.tsx:421`). Give regular members a way
  to view their own club roster (read-only), separate from the admin
  management view.
- [ ] **Duplicate close/reopen-evening controls.** Two independent
  implementations for the same action: `EveningHubPage.tsx:146-165` (sub-tab
  strip) and `EveningPage.tsx:266-304` (evening-info card). Consolidate to one.
- [ ] **Two different "committee" surfaces share the same label/icon.**
  `ClubAdminPage.tsx`'s admin sub-tab (`CommitteeAdminTab`) vs. main-nav
  `CommitteePage.tsx` — differentiate labeling so admins don't confuse them.
- [ ] **`StatsPage.tsx` is one long scroll with no sub-tab/anchor nav** unlike
  every sibling page (Treasury/Committee/ClubAdmin all use tab strips). Add a
  tab strip or sticky section nav across its major sections (evening detail,
  highlights, player cards, correlation, year podium, member list).

### 3. Consistency

- [ ] **Error display split between `showToast()` and ad hoc inline banners.**
  Replace inline red-banner error rendering with `showToast()` (or a single
  shared inline-error component if inline display is intentionally needed) in:
  `LoginPage.tsx:157,195,247`, `EveningPage.tsx:452,566`,
  `ProtocolPage.tsx:514-515`, `ClubAdminPage.tsx:1480,1402`,
  `SeasonTab.tsx:436`.
- [ ] **No shared loading-state component.** Introduce one (e.g. a small
  `Loading` component) and use it consistently instead of: plain `<p>` in
  `CommitteePage.tsx:155,372,685`, `SchedulePage.tsx:305,780,968,1272`,
  `HistoryPage.tsx:142`; and the misused `Empty` component in
  `StatsPage.tsx:1954,2484,2830`.
- [ ] **Delete-confirmation UX differs by page.** Standardize on the inline
  two-step chip confirm (✕→✓/✕) already used in `ProtocolPage.tsx:528-541`,
  `GamesPage.tsx:380`, `HistoryPage.tsx:315`,
  `SchedulePage.tsx:1103,1331-1338`, `CommitteePage.tsx:257,447,905` for
  lightweight deletes; keep the full `Sheet` modal pattern
  (`MembersPage.tsx:551-588`) reserved for higher-stakes actions only, and
  migrate `TreasuryPage.tsx:1352-1378` (delete payment/expense) to the inline
  pattern unless its stakes justify staying a Sheet.

### 4. Accessibility

- [ ] **Text contrast likely fails WCAG AA.** `--kce-muted: #7a6258` on
  `--kce-bg: #1a1410` (`frontend/src/index.css:46,51`) computes to ~3.2:1,
  below the 4.5:1 minimum for normal text. Used almost everywhere for
  timestamps/hints/axis labels. Introduce a higher-contrast muted token (or
  raise this one) for body-readable meta text.
- [ ] **Chart label text is both tiny and low-contrast.** `fontSize="9"` +
  `fill="var(--kce-muted)"` in `StatsPage.tsx:101-107,834-839` and
  `TreasuryPage.tsx:199-203,251-252`, rendered inside a fixed viewBox scaled
  to phone width — effectively 8-9px real text on a low-contrast color.
- [ ] **Shared `Sheet` component has no focus management.** No
  `role="dialog"`, `aria-modal`, initial focus, or focus-restore on close
  (`components/ui/Sheet.tsx:91-122`). `ProfileSheet.tsx:328` re-implements
  this itself instead of it living in the shared component every other
  sheet in the app uses — fixing it once in `Sheet.tsx` benefits every page.
- [ ] **Chart interactions are mouse/touch-only.** Donut segments and chart
  dots have no `tabIndex`/`role`/`aria-label`, unreachable via keyboard or
  screen reader: `StatsPage.tsx:444-456` (donut segments),
  `StatsPage.tsx:125-138` (dot markers), `TreasuryPage.tsx:190-197` (chart
  event points).
- [ ] **Touch targets undersized for the club's older user base.** `.btn-xs`
  (~22-24px, `index.css:155-157`) used for consequential void/edit-throw
  buttons in `TabletQuickEntryPage.tsx:754-774,714-724`; Sheet's close
  button is 28×28px (`Sheet.tsx:110-117`) — both under the ~44px
  recommended minimum.
- [ ] **Icon-only buttons mostly lack `aria-label`** (only 6/32 files use it
  at all) — Sheet close, throw edit/void, camera close buttons need
  accessible names.

### 5. Responsiveness

- [ ] **Zero Tailwind breakpoints (`sm:/md:/lg:/xl:`) anywhere in the
  codebase.** Layout adapts only via flex/percentage widths, not
  viewport-aware breakpoints.
- [ ] **`TabletQuickEntryPage.tsx:967-969,1104-1112` hardcodes a fixed
  22%/22%/flex-1 three-column layout** with no stacking fallback — breaks
  down on portrait orientation or smaller tablets, despite this page being
  the app's best-designed flow otherwise (2-tap penalty/drink logging).
- [ ] **PWA manifest forces `orientation: 'portrait'`** (`vite.config.ts:51`)
  while `TabletQuickEntryPage`/`CameraCapturePage` are explicitly landscape
  kiosk UIs — a real conflict that could fight orientation lock on
  installed Android PWAs.
- [ ] **Silent service-worker auto-update.** `registerType: 'autoUpdate'`
  with `sw.ts:12-14` calling `skipWaiting()`+`clientsClaim()` immediately on
  install, no in-app "update available" prompt — could cause an unexplained
  reload mid-evening for a non-technical user.

### Docs (per CLAUDE.md — do before committing, once implementation happens)

- [ ] Update `CLAUDE.md` Feature Roadmap table if any of the above become a
  tracked, user-facing behavior change.
- [ ] Update `README.md` feature catalog if navigation/visibility changes
  (e.g. member roster access) alter documented behavior.

## Review

### Round 1: Cheap bugs (done)

- `--kce-amber` now declared in `:root` (`frontend/src/index.css`) as an
  alias for `--kce-primary`. Fixes 30+ previously-silent color references.
- `StatsPage.tsx`: 4 hardcoded `#e8a020` values → `var(--kce-primary)`.
  Gradient start stops (`#c4701a`) intentionally left hardcoded — not a
  token duplicate.
- i18n: `ClubAdminPage.tsx` backup-empty/backup-error/broadcast-error and
  `StatsPage.tsx` loading state now go through `t()`. Added one new key pair
  (`broadcast.error`) to `de.ts`/`en.ts`; reused two existing-but-unused keys
  (`backup.empty`, `backup.error`).
- Verified: `npm run build` clean (tsc + vite), full Vitest suite green
  (1776/1776), i18n key parity between `de.ts`/`en.ts` confirmed (979/979,
  no drift).
- Not yet started: Navigation/discoverability, Consistency, Accessibility,
  Responsiveness sections.

---

# Treasury (Kasse) — High-Priority Correctness & Data-Integrity Fixes

Source: treasury improvement recommendations (see conversation). This file
tracks implementation of items 1-7 (the "high priority" tier) from that
report. Items 8-18 (maintainability + feature gaps) are deferred — not in
scope for this pass.

Working branch: `claude/treasury-management-improvements-lpvs0g`.

## Plan

### 1. TOCTOU race on payment-request confirm/reject (quick win)
- [x] `confirm_payment_request` / `reject_payment_request` (`club.py`):
  add `.with_for_update()` on the `PaymentRequest` row lookup so two
  concurrent admin taps can't both pass the `status == pending` check.
- [x] pytest: existing single-request confirm/reject tests still pass.

### 2. Missing amount validation on `POST /club/member-payments`
- [x] Reject `amount == 0` (mirror `create_expense`'s check) in
  `PaymentCreate`/`create_member_payment`.
- [x] pytest: 400 on zero amount.

### 3. Silent payment deletion (no member notification)
- [x] `delete_member_payment`: push-notify the affected member (reuse
  `push_to_regular_member`, mirror the pattern used in `create_member_payment`).
- [x] pytest: notification is dispatched on delete (checked via `NotificationLog`).

### 4. Linked transactions correlated only by note-string matching
- [x] Add `transfer_group_id` (nullable, indexed string) column to
  `MemberPayment` via new Alembic migration.
- [x] `transfer_guest_costs`: set matching `transfer_group_id` on both paired
  rows instead of relying solely on note text.
- [x] Season close/reopen (`season.py`): tag carry-over payments with a
  `transfer_group_id` derived from `(club_id, year)` and use it to find them
  on reopen; kept the literal `f"Jahresabschluss {year}"` note-text match as
  an OR fallback so seasons closed before this migration are still reversible.
- [x] pytest: guest-cost-transfer round trip finds both rows via
  `transfer_group_id`; season reopen still correctly reverses carry-over
  (new + legacy note-only row) — `test_reopen_season_reverses_legacy_note_only_carry_over`.

### 5. No audit trail / hard deletes on `MemberPayment` / `ClubExpense`
- [x] Add `is_deleted`, `deleted_at`, `deleted_by`, `delete_reason` columns
  to both models (mirror `PenaltyLog.is_deleted` pattern) via migration.
- [x] Convert `delete_member_payment` / `delete_expense` from hard `db.delete()`
  to soft-delete (set flags), accept an optional reason via a `?reason=` query param.
- [x] Update every read path that sums these tables (`get_member_balances`,
  `get_guest_balances`, `get_my_balance`, `get_treasury_debt_timeline`,
  `remind_debtors`, `list_all_payments`, `list_expenses`,
  `season.py::_compute_balances`) to filter `is_deleted == False`.
- [x] Add `logger.info(...)` calls consistently on all treasury mutations
  that currently lack them (create/delete payment, create/delete expense).
- [x] Frontend: delete-confirmation sheet in `TreasuryPage.tsx` gains an
  optional reason field; still shows a confirm step.
- [x] pytest: soft-deleted rows excluded from balances but still queryable;
  reason/deleted_by persisted.

### 6. Idempotency for double-submitted money mutations
- [x] Add `idempotency_key` (nullable, globally unique) column to
  `MemberPayment` and `ClubExpense`.
- [x] `create_member_payment` / `create_expense`: accept optional
  `idempotency_key`; if a row with that key already exists for the club,
  return the existing row instead of creating a duplicate.
- [x] **Scope correction**: the original framing ("offline-queue-reachable")
  was wrong — `isQueuableMutation` in `offlineQueue.ts` explicitly excludes
  `/club/member-payments` and `/club/expenses` from offline queueing (they
  "need real response values or must not be replayed blindly"). The real
  risk is a plain double-tap or network-retry on a live connection, not
  offline replay. Implemented by generating a `crypto.randomUUID()` inside
  `api.createMemberPayment`/`api.createExpense` on every call — no
  offlineQueue.ts changes needed.
- [x] pytest + Vitest: duplicate submission with same key returns the
  original row, no second row created; api client generates a key per call.

### 7. `MemberPayment.amount` stale doc-comment
- [x] Fix the "always positive" comment in `backend/app/models/payment.py`
  to reflect actual signed usage (deposits positive, payouts/transfers can
  be negative).

## Deferred (not in this pass)
Items 8-18 from the original report (Decimal/Numeric currency migration,
shared balance-computation helper, transaction categories, typed settings,
server-side cash endpoint, recurring dues, bank reconciliation, budget/forecast,
confirm-preview on payment entry, duplicated PayPal JSX). Revisit after this
pass ships.

## Docs (per CLAUDE.md — before committing)
- [x] Update `CLAUDE.md` Feature Roadmap (Kasse row, #3) to note the
  audit-trail/soft-delete/idempotency additions since they change
  user-visible behavior (reason prompt on delete).
- [x] Update `README.md` feature catalog.

## Review

All 7 high-priority items implemented, tested, and verified:

- **Migration**: `backend/alembic/versions/047_treasury_audit_and_idempotency.py`
  adds `is_deleted`/`deleted_at`/`deleted_by`/`delete_reason`/`idempotency_key`
  to `member_payment` + `club_expense`, plus `transfer_group_id` to
  `member_payment`. Not verified against a live Postgres instance (no Docker
  daemon in this sandbox) — closely mirrors the existing `046_season_snapshot.py`
  pattern (partial-nullable unique index, FK-scoped columns).
- **Backend**: `backend/app/api/v1/club.py` and `backend/app/api/v1/season.py`.
- **Tests**: `backend/tests/test_treasury.py` (new tests + 2 existing hard-delete
  assertions updated to soft-delete semantics), `backend/tests/test_season.py`
  (transfer_group_id assertion + legacy-fallback test).
  Full suite: **780 passed** (pytest), ruff clean.
- **Frontend**: `frontend/src/api/client.ts` (idempotency key generation,
  reason query param), `frontend/src/pages/TreasuryPage.tsx` (reason input in
  both delete sheets), i18n keys added to `de.ts`/`en.ts`.
  Full suite: **1782 passed** (vitest), `npm run build` clean (tsc + vite).
- **Scope correction on item 6**: see the note under item 6 above — the
  offline-queue framing in the original report was inaccurate for these two
  specific endpoints (they're excluded from queueing); implementation and
  rationale adjusted accordingly, real risk (double-tap/retry) still covered.
- **Backward compatibility**: season-close reopen matches on
  `transfer_group_id` OR the legacy note string, so seasons closed before
  this migration remain reversible.
- Version bumped `1.14.2` → `1.15.0` (MINOR — new user-visible behavior:
  delete reason prompt, deletion push notification).
- Deferred items 8-18 (Decimal/Numeric currency, shared balance helper,
  transaction categories, etc.) untouched, as planned.

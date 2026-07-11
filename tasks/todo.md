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

### 2. Navigation / discoverability ✅ done

- [x] **`EveningPage` (team/player management, close evening) has no visible
  nav entry.** Added a "⚙️ Verwalten" button to `EveningHubPage.tsx`'s tab
  strip (calls the existing `onNavigate` prop) so it's reachable in-context,
  not just via the small "AKTIV" header pill.
- [x] **`MembersPage` (roster, avatars, pins) unreachable for regular members.**
  Added a new `'members'` nav tab in `App.tsx`, shown only for non-admin
  users (mutually exclusive with the admin-only `'club'` tab, so total
  visible-tab count stays at 6 for both roles). `MembersPage` needed no
  changes — its mutation UI was already internally gated by `isAdmin(user)`.
- [x] **Duplicate close/reopen-evening controls.** Extracted shared
  `frontend/src/hooks/useCloseReopenEvening.ts`, used by both
  `EveningHubPage.tsx` and `EveningPage.tsx`. Standardized on the Sheet-based
  confirm (matches Consistency section's guidance to reserve Sheet for
  higher-stakes actions) and made `EveningPage`'s fuller invalidation
  (clear `activeEveningId`, invalidate `['schedule']`) canonical for both —
  fixing a real behavioral divergence, not just a style duplication.
- [x] **Two different "committee" surfaces — milder than first reported.**
  Re-verified: the main-nav label is actually "Neuigkeiten"/"News", not
  "Committee" — not confusable by label. The one real defect (hardcoded,
  non-i18n `'🚌 VGA'` sub-tab label in `ClubAdminPage.tsx:68`) is fixed:
  now `t('club.tab.committee')` → "🛠️ VA-Verwaltung" / "🛠️ Committee admin",
  a tools icon distinct from the 🚌 already used for Kegelfahrten.
- [x] **`StatsPage.tsx` is one long scroll with no sub-tab/anchor nav.**
  Split into "Abend" / "Jahr" tabs via `useHashTab`, matching the tab-strip
  pattern from `CommitteePage`/`ClubAdminPage`/`TreasuryPage`. Removed the
  now-redundant inline sub-headings for both sections since the tab label
  conveys that role.

### 3. Consistency ✅ done

- [x] **Error display split between `showToast()` and ad hoc inline banners.**
  Re-surveyed before touching code: only `LoginPage.tsx` actually had inline
  catch-block error banners (`error`/`setError` state, 3 identical
  `{error && <p className="text-red-400 text-xs">{error}</p>}` sites at
  login/reset/register forms). The other flagged lines were stale/false
  positives — `EveningPage.tsx:452,566` is a `.map()` closing brace and a
  static "no teams yet" hint (not error state); `ProtocolPage.tsx:514-515`
  is currency-red styling for money owed, and its catch blocks already use
  `toastError()`; `SeasonTab.tsx:436` is a danger-button style, also already
  on `toastError()`; `ClubAdminPage.tsx:1402` is a per-record `error` flag
  badge (not catch-block state) and `:1480` is a react-query list-load
  error, not a transient mutation error. Login is pre-auth UX where a toast
  could be missed before the user notices it — kept inline rather than
  converting to `showToast()`, but extracted the 3 duplicate banners into a
  shared `frontend/src/components/ui/InlineError.tsx` component (satisfies
  the task's "shared inline-error component" fallback). Left
  `ClubAdminPage.tsx`'s backups-list load error inline (list-load errors
  need persistent context, not a transient toast) — out of scope beyond
  this item. New Vitest: `InlineError` renders text / renders nothing when
  empty, added to `components/ui/__tests__/components.test.tsx`. Full
  suite: 1784/1784 passing, `npm run build` clean.
- [x] **No shared loading-state component.** Added
  `frontend/src/components/ui/Loading.tsx` (`text`/`className` props,
  defaults to `t('action.loading')` centered muted text, `py-4`). Replaced
  all flagged sites: `CommitteePage.tsx` (3x, `py-8`), `SchedulePage.tsx`
  (4x, default `py-4`), `HistoryPage.tsx` (1x), and the misused `Empty`
  loading placeholders (icon `⏳`/text `…`, or icon `📈`/text
  `action.loading` — semantically an empty-state component repurposed for
  loading) in `StatsPage.tsx` (3x, `py-8`). Left two smaller inline
  loading `<p>`s (`SchedulePage.tsx:1123`, `HistoryPage.tsx:333`) as-is —
  not in the original flagged set and visually distinct (compact
  `text-xs`/`py-2` inline-list loading, not page/section-level). New
  Vitest: `Loading` renders default text / renders custom text override,
  added to `components/ui/__tests__/components.test.tsx`. Full suite:
  1786/1786 passing, `npm run build` clean.
- [x] **Delete-confirmation UX differs by page — verified, no migration
  needed.** Re-checked `TreasuryPage.tsx:1355-1395` against the inline
  two-step chip confirm pattern (`ProtocolPage.tsx:528-541` etc.). Since
  this todo item was written, the Treasury audit-trail work (roadmap item
  #5 above) added an optional free-text `reason` input to both delete
  sheets (`deletePaymentReason`/`deleteExpenseReason` → sent as
  `?reason=` to `deleteMemberPayment`/`deleteExpense`, persisted as
  `PenaltyLog`-style `delete_reason` for the audit trail). A text input
  has no room in the inline ✕→✓/✕ chip pattern (two icon buttons, no
  field), and deleting a financial transaction is exactly the
  "higher-stakes action" the item's own carve-out reserves `Sheet` for —
  so the existing Sheet is the correct choice here, not a deviation to
  fix. No code change made for this item; verified by reading the current
  implementation rather than assuming the original (pre-audit-trail)
  survey still applies.

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
- Not yet started: Consistency, Accessibility, Responsiveness sections.

### Round 2: Navigation / discoverability (done)

- `App.tsx`: new `'members'` `PageId`, `NAV` entry (`UserRound` icon), and
  `NAV_PAGES` entry; nav filter now shows `'club'` only to admins and
  `'members'` only to non-admins (mutually exclusive, same total tab count).
- `EveningHubPage.tsx`: added a "⚙️ Verwalten" button next to close/reopen
  in the tab strip, wired to the existing `onNavigate` prop.
- New `frontend/src/hooks/useCloseReopenEvening.ts` shared by
  `EveningHubPage.tsx` and `EveningPage.tsx`; `EveningPage.tsx`'s confirm UI
  switched from an inline two-step confirm to the same Sheet pattern as
  `EveningHubPage.tsx`. Canonical close behavior now always clears
  `activeEveningId` and invalidates both `['evenings']` and `['schedule']`.
- `ClubAdminPage.tsx:68`: hardcoded `'🚌 VGA'` → `t('club.tab.committee')`.
- `StatsPage.tsx`: added an "Abend"/"Jahr" `useHashTab` tab strip; wrapped
  the two existing sections in `{tab === 'evening' && (...)}` /
  `{tab === 'year' && (...)}` (matches `CommitteePage`'s sub-tab convention
  of conditional rendering, not the top-level "always mounted" pattern).
- Test updates: `App.test.tsx` gained a `MembersPage` mock (mirroring every
  other top-level page) and assertions for the new mutually-exclusive
  `'members'`/`'club'` tabs; `ClubAdminPage.test.tsx`'s VGA-label test
  updated for the new i18n key; `StatsPage.test.tsx`'s `renderStatsPage()`
  helper gained an optional `tab` param (14 tests updated to pass `'year'`
  since their content now lives behind the new year tab).
- Verified: `npm run build` clean, full Vitest suite green (1776/1776),
  i18n key parity confirmed (981/981, no drift).

### Round 3: Consistency (done)

- Re-surveyed every flagged line before editing (an agent-driven check),
  since Round 1/2's line numbers had already drifted from later commits —
  most of the todo's original 3.1 line references turned out to be false
  positives (currency styling, danger-button styling, per-record status
  flags, already-`toastError()`'d catch blocks) rather than actual inline
  error banners.
- New `frontend/src/components/ui/InlineError.tsx` — extracted from 3
  duplicate `{error && <p className="text-red-400 text-xs">{error}</p>}`
  sites in `LoginPage.tsx` (login/reset/register forms). Kept inline
  (pre-auth UX, toast could be missed) rather than converting to
  `showToast()`.
- New `frontend/src/components/ui/Loading.tsx` (`text`/`className` props) —
  replaced 8 ad hoc loading `<p>`s across `CommitteePage.tsx`,
  `SchedulePage.tsx`, `HistoryPage.tsx`, and the misused `Empty`-as-loading
  placeholders in `StatsPage.tsx`.
- `TreasuryPage.tsx` payment/expense delete confirmation verified and left
  as `Sheet` — the Treasury audit-trail work (this file, item #5, shipped
  earlier) already added a `reason` text input to those sheets, which
  doesn't fit the inline ✕→✓/✕ chip pattern and is exactly the
  higher-stakes case the item's own text carves out for `Sheet`. No code
  change; documented the reasoning so this isn't re-flagged.
- No `CLAUDE.md`/`README.md`/version bump — all three changes are
  behavior-preserving internal refactors (same rendered text, same UX),
  not new or changed user-facing features, consistent with how Round 1
  (cheap bugs) was also not versioned.
- Verified: `npm run build` clean (tsc + vite), full Vitest suite green
  (1786/1786, +10 new tests for `InlineError`/`Loading`).
- Not yet started: Accessibility, Responsiveness sections.

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

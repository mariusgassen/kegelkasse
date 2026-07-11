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

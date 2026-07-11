# UI/UX Improvements — Round 1: Cheap Bugs, Navigation/Discoverability, Consistency

Scope for this round: the three categories the user picked from the UI/UX
recommendation pass (accessibility and responsiveness deferred to a later
round — findings for those exist in the prior chat but are not tracked here).

This file is the roadmap only — implementation has not started. Each item
below traces back to a concrete file:line finding from the codebase survey.

## Decisions (confirmed with user)

- Round 1 = Cheap bugs + Navigation/discoverability + Consistency only.
- Roadmap is written first; implementation starts only after this is reviewed.

## Plan

### 1. Cheap bugs

- [ ] **`--kce-amber` CSS var never declared.** Declare `--kce-amber` in
  `:root` in `frontend/src/index.css` (alias for `--kce-primary`, next to the
  other `--kce-*` tokens at lines 43-52) so all 30+ existing `var(--kce-amber)`
  references resolve instead of silently failing. Affected files: `StatsPage.tsx`,
  `TabletQuickEntryPage.tsx`, `CameraCapturePage.tsx`, `ProtocolPage.tsx`,
  `GamesPage.tsx:308`, `CommitteePage.tsx:769`, `ClubAdminPage.tsx:1398`,
  `components/ProfileSheet.tsx:69,73`.
- [ ] **Hardcoded hex duplicating tokens.** Replace `fill="#e8a020"`
  (`StatsPage.tsx:2242`) and gradient stops `#c4701a`/`#e8a020`
  (`StatsPage.tsx:862-864,994,1105,2737`) with `var(--kce-primary)`.
- [ ] **Hardcoded strings bypassing i18n.** Replace with `t()` calls using
  existing/new keys: `ClubAdminPage.tsx:1392` ("Noch keine Backups vorhanden."),
  `ClubAdminPage.tsx:1402,1480` ("Fehler"), `StatsPage.tsx:2830` ("Lade..." →
  reuse existing `action.loading` key already used elsewhere).

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

### Docs (per CLAUDE.md — do before committing, once implementation happens)

- [ ] Update `CLAUDE.md` Feature Roadmap table if any of the above become a
  tracked, user-facing behavior change.
- [ ] Update `README.md` feature catalog if navigation/visibility changes
  (e.g. member roster access) alter documented behavior.

## Review

_(to be filled in after implementation)_

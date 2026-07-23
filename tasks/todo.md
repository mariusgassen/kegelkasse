# Navigation rework — Verein hub

Branch: `claude/navigation-redesign-tabs-ir8h4q`

## Problem
Bottom bar / side-rail renders a flat 6-permanent-tab NAV (`RootLayout.tsx`), +Abend when
active = up to 7. Well past the 4–5 a thumb bar wants. Home is already a hub (surfaces news,
balance, stats, quick-actions), so Stats/Neuigkeiten each eat a permanent slot redundantly.
There's also an awkward member/admin split (Mitglieder XOR Verein).

## Chosen model — 4 permanent + 1 contextual
Primary bar: 🏠 Start · 💰 Kasse · 📅 Termine · 🤝 Verein  (+ 🏆 Abend only while active).
"Verein" is a hub grouping the low-frequency club/people/analytics pages into a secondary
section strip: Neuigkeiten (all) · Mitglieder (all) · Stats (all) · Verwaltung (admin only).

## Key design decision
Implement the hub as a **shell-level secondary section strip**, not a new wrapper route:
- The 4 grouped pages stay real routes (`/committee`, `/members`, `/stats`, `/club`) — all
  deep links, push URLs, legacy-hash translation and per-page tests are untouched.
- `RootLayout` renders a secondary strip (in the header region) whenever the active page is one
  of the group; the primary "Verein" tab is active for the whole group and lands on `/committee`.
- Zero changes to CommitteePage/MembersPage/StatsPage/ClubAdminPage. Minimal impact.

## Steps
- [ ] `RootLayout.tsx`: new primary NAV (home, evening, treasury, schedule, verein); verein virtual
      group id (active when page ∈ group, click → /committee). Remove club/members from primary +
      drop the role split there.
- [ ] `RootLayout.tsx`: secondary Verein section strip, role-gated (Verwaltung admin-only), shown
      only when page ∈ {committee, members, stats, club}.
- [ ] i18n: add `nav.verein`, `nav.manage` to de.ts + en.ts (parity).
- [ ] Update `__tests__/App.test.tsx` nav assertions; add group + strip tests.
- [ ] Docs: README feature catalog + CLAUDE.md Feature Roadmap (+ docs page if present); version bump.
- [ ] Lint/build + targeted vitest, then push + PR.

## Review (done)

Primary nav trimmed to **Start · Kasse · Termine · Verein** for every role (+ contextual Abend),
down from 6–7. The club/people/analytics pages moved behind a **Verein hub**: a virtual group
tab (active for `committee`/`members`/`stats`/`club`, lands on Neuigkeiten) plus a secondary
section strip under the header (Neuigkeiten · Mitglieder · Stats · Verwaltung — admin-only).

Implemented purely at the shell level (`RootLayout.tsx` + 2 i18n keys) — the grouped pages stay
real routes, so all deep links / push URLs / legacy-hash translation / per-page tests are
untouched. The old members-vs-Verein role split folded into the hub.

Tests: `App.test.tsx` nav assertions reworked + new group/strip/click tests — full App suite 59
green; `tsc --noEmit` and `npm run lint` clean (0 errors); i18n parity green. Version → 1.37.0.
Docs: README feature catalog, docs/erste-schritte.md navigation section, CLAUDE.md roadmap #79.

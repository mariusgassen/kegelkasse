# Overhaul: findings & improvements

Branch: `claude/findings-improvements-overhaul-uxbnc9`

## Finding 1 — Too many tabs; evening tab shown even when no active evening
- [ ] Hide `evening` nav tab when there is no active evening (RootLayout NAV filter)
- [ ] Preserve admin ad-hoc start: HomePage admin "Neuen Abend starten" quick action -> /evening
- [ ] Tests (App shell nav)

## Finding 2 — Loading not shown; graphs render "no data" while loading
- [ ] Distinguish loading from empty in the main charts (HomePage sparkline, StatsPage, TreasuryPage)
- [ ] Show a skeleton/spinner while queries are pending instead of empty state

## Finding 3 — Accounts load slow
- [ ] Optimize /club/member-balances (SQL aggregation instead of loading all ORM rows)
- [ ] Add loading state to the accounts tab

## Finding 4 — Make real pin/throw tracking optional per club
- [ ] Backend: throw_tracking_enabled in club settings (default true)
- [ ] Frontend: type + lib/clubSettings.ts pure helper + useThrowTracking() hook
- [ ] ClubAdminPage toggle
- [ ] Gate: GamesPage camera, Tablet throw strip, LiveEveningView last-throw, StatsPage throw
      detail + Hall-of-Shame worstThrow, ProfileSheet throw card, HomePage sparkline, Wrapped throw card
- [ ] Tests

## Review
(to fill in)

## Review (done)

All four findings implemented, committed on `claude/findings-improvements-overhaul-uxbnc9`.

1. **Tabs / evening hidden when inactive** — `RootLayout` NAV filter hides `evening` unless
   `activeEveningId` is set; admins get a "Neuen Abend starten" callout on the HomePage. Members
   drop from 7→6 tabs when nothing is running.
2. **Loading vs no-data** — `<Loading/>` now shows while queries load in StatsPage (evening/year),
   TreasuryPage accounts list, and the balance-history chart (new `loading` prop).
3. **Accounts slow** — `member-balances` + `guest-balances` now aggregate penalties/payments in
   SQL (`func.sum` + shared `_PENALTY_EURO_SQL` CASE) instead of loading every PenaltyLog row.
4. **Optional throw tracking** — `throw_tracking_enabled` club setting (default on) + admin toggle;
   `useThrowTracking()` gates every throw surface (camera, throw strip, live last-throw, stats,
   profile, dashboard, wrapped, hall-of-shame weakest-throw).

Tests: backend club (2 new) + treasury (86) green; frontend full suite 2165 green; lint/tsc clean.
Docs: README feature catalog, docs/funktionen/spiele.md, CLAUDE.md roadmap #78, version → 1.36.0.

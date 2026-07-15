# Fun Features: Kegel-Wrapped + Achievements & Badges

Both derive from existing data (penalties, drinks, king flags, games, attendance) —
no new tables, computed endpoints only. Live in ProfileSheet (the "regular check-in" home).

## Backend (`stats.py`)
- [ ] `_compute_achievements(evenings, member_id)` — pure, career-wide badge set (12 badges, tiered)
- [ ] `_compute_wrapped(evenings, member_id, year, year_penalty_by_member)` — pure, per-year funny recap
- [ ] `GET /stats/me/achievements` + `GET /stats/members/{id}/achievements` (register before `/me/{year}`)
- [ ] `GET /stats/me/wrapped/{year}` + `GET /stats/members/{id}/wrapped/{year}`
- [ ] pytest: `tests/test_stats.py` — structure, earned/locked, tiers, rank, auth guards, cleanup

## Frontend
- [ ] `types.ts`: `Achievement`, `WrappedStats`
- [ ] `api/client.ts`: `getMyAchievements`, `getMemberAchievements`, `getMyWrapped`, `getMemberWrapped`
- [ ] `lib/achievements.ts` (pure: sort earned-first, tier order) + Vitest
- [ ] `lib/wrapped.ts` (pure: `buildWrappedCards(stats, t, fe)`) + Vitest
- [ ] `components/AchievementShelf.tsx` — badge grid, earned bright / locked greyed w/ progress
- [ ] `components/WrappedDeck.tsx` — fullscreen swipeable card deck
- [ ] ProfileSheet: badge shelf card + "🎁 Jahresrückblick" launch button
- [ ] i18n: add keys to `de.ts` then `en.ts` (parity test)

## Docs / meta
- [ ] `docs/docs/funktionen/statistiken.md`, `README.md`, `CLAUDE.md` roadmap
- [ ] bump `frontend/package.json` version (MINOR)

## Verify
- [ ] targeted pytest + vitest for touched files, then push & watch CI

## Review

Both features ship as **computed endpoints** — no new tables, no migration. Pure
functions in `stats.py` derive everything from existing evening/game/penalty/drink
data, so history retroactively populates badges and the year recap.

- **Achievements** (`_compute_achievements`): 12 career badges, 8 tiered
  (bronze/silver/gold via `_tiered`), 4 binary. Streak/hattrick use `_longest_run`
  over the chronologically sorted club evenings. Returns machine-readable
  `{key, icon, earned, tier, progress, target}`; titles/descriptions are i18n keys.
  `GET /stats/me/achievements` + `/members/{id}/achievements` (registered before
  `/me/{year}` so "achievements" isn't parsed as a year).
- **Kegel-Wrapped** (`_compute_wrapped`): per-year funny recap incl. biggest/favourite
  penalty, penalty rank in the club, and a derived `title_key` finale.
  `GET /stats/me/wrapped/{year}` + `/members/{id}/wrapped/{year}`.
- **Frontend**: pure `lib/achievements.ts` + `lib/wrapped.ts` (fully unit-tested),
  `AchievementShelf` (badge grid) + `WrappedDeck` (fullscreen tap/swipe card story),
  both surfaced in the ProfileSheet (the "regular check-in" home).
- **Tests**: pytest 76/76 (18 new), Vitest — 21 new lib tests + 4 api-client tests,
  ProfileSheet 150/150 green, i18n de↔en parity green, `tsc`/`npm run build`/lint clean.
- Version 1.23.0 → 1.24.0; docs (`statistiken.md`), README, CLAUDE.md roadmap
  (#52 Achievements, #53 Kegel-Wrapped) updated.

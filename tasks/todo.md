# Idle Island Status & Quick-Start Game Action

## Goal
Give the Dynamic Island (`EveningIsland`) a useful, interactive idle state when no evening is running so there isn't a dead black notch all the time, and add a game-start action in the expanded evening view when an evening is active without a running game.

## Plan
- [x] 1. Create pure helper module `frontend/src/lib/islandIdle.ts` for idle-mode derivation (`deriveIdleIslandMode`), compact/full schedule date formatting (`daysUntilDate`, `formatScheduleCompact`, `formatScheduleFull`), and compact balance formatting (`formatEurCompact`, `formatEurFull`).
- [x] 2. Add `nextOpenGame` and `canStartGameInEvening` pure helpers in `frontend/src/lib/liveEvening.ts`.
- [x] 3. Add i18n keys to `frontend/src/i18n/de.ts` and `frontend/src/i18n/en.ts` (next evening, today/tomorrow/in-days, idle fallback, start game).
- [x] 4. Update `frontend/src/components/evening/EveningIsland.tsx`:
  - Add `IdleStatusActivity` (`priority: -1`, active when logged in and no open evening is running): shows next scheduled evening (with 1-tap RSVP buttons and balance badge in expanded view) or falls back to personal balance (`my-balance`), or schedule quick-link if neither exists.
  - Enhance `EveningActivity` expanded view when no game is running to keep pot/drinks visible and offer a primary "Start game" (`api.startGame` for next ready open game, or navigate to `/evening?tab=games`).
- [x] 5. Add unit tests in `frontend/src/lib/__tests__/islandIdle.test.ts`, `frontend/src/lib/__tests__/liveEvening.test.ts`, and `frontend/src/components/__tests__/EveningIsland.test.tsx`.
- [x] 6. Update docs (`docs/docs/funktionen/abende.md`, `README.md`, `CLAUDE.md`) and verify with Vitest, ESLint, and `npm run build`.

## Review
- `IdleStatusActivity` runs at `priority: -1` so live evening activities, alerts, quick-entry receipts, uploads, offline sync, and payment requests naturally take precedence and split-pill cleanly via `<BubbleForm bubble={null}>`.
- Reuses `['schedule']` and `['my-balance']` query keys so RSVP mutations invalidate and synchronize `HomePage`, `SchedulePage`, and the island together.
- Targeted Vitest suites (`islandIdle.test.ts`, `liveEvening.test.ts`, `EveningIsland.test.tsx`, `i18n.test.ts`, `colourLiterals.test.ts`, `iconAffordance.test.ts`) all pass (73/73).

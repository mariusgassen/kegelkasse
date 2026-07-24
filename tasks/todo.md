# Easter Egg: Logo-Tap Mini-Kegelspiel (9 Pin)

Branch: `claude/logo-tap-bowling-easter-egg-jkokb1`

Tap the club logo/title 5× quickly → opens a mini 9-pin bowling game that keeps a high score.

## Context
`RootLayout.tsx` already has a 5-tap logo gesture, but it opens the TEMP `VpDebug` viewport
diagnostic (built for the iOS PWA viewport bug that roadmap #63 marks as resolved). There can
only be one 5-tap gesture → repurpose it to the Easter-egg game and retire `VpDebug`.

## Plan
- [ ] `store/bowling.ts` — zustand `persist` store for the high score (`kegelkasse-bowling`)
- [ ] `lib/bowlingGame.ts` — pure, testable logic: diamond rack of 9 pins, ball launch, physics
      step (circle collisions + walls + damping), at-rest detection, knocked-pin scoring
- [ ] `components/BowlingGame.tsx` — full-screen overlay: canvas render + aim-sweep/power-meter
      single-tap controls, 3 balls per game, clear-the-rack reset bonus, live + high score
- [ ] `RootLayout.tsx`: point the 5-tap gesture at the game; remove `VpDebug` wiring/import
- [ ] Remove `components/VpDebug.tsx` (+ its test) — temporary diagnostic, bug resolved
- [ ] i18n keys (`bowling.*`) in `de.ts` then `en.ts` (keep parity)
- [ ] Tests: `lib/bowlingGame` (pure logic), `store/bowling`, `BowlingGame` component smoke
- [ ] Version bump `frontend/package.json` (MINOR — new feature)
- [ ] Docs: `docs/docs/`, `README.md` feature catalog, CLAUDE.md roadmap
- [ ] Push + open PR

## Review

Added a hidden mini 9-pin bowling game behind the existing 5-tap logo gesture.

- `lib/bowlingGame.ts` — pure, framework-free physics/logic (diamond rack, launch, `stepWorld`
  pure step with circle collisions + friction + walls, at-rest, knocked-pin scoring). 17 tests.
- `store/bowling.ts` — zustand `persist` high score (`kegelkasse-bowling`), on-device only. 5 tests.
- `components/BowlingGame.tsx` — full-screen kiosk overlay: aim-sweep/power-meter single-tap
  controls, canvas render + rAF loop, 3 balls, Alle-Neune re-rack bonus, live + high score,
  Esc/✕ close. 5 smoke tests.
- `RootLayout.tsx` — 5-tap gesture repurposed to open the game; retired the TEMP `VpDebug`
  diagnostic (iOS viewport bug resolved per roadmap #63) — component file removed.
- i18n `bowling.*` keys (de + en, parity). Version → 1.39.0.
- Docs: README UI/UX catalog, new `docs/docs/funktionen/easter-egg.md` (+ sidebar), CLAUDE.md #80.

Verified: `tsc --noEmit` clean, eslint clean on changed files, 26 new tests + App suite (63) green.
Full suite left to CI per repo convention.

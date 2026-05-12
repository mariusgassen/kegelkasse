# Enhance stats per evening

## Goal

Two improvements to the evening analysis section on StatsPage:

1. **Games & results drawer** — show all games and their results in an additional drawer that opens from a games-overview card next to the donut chart.
2. **Click penalty dots on the cumulative chart** — clicking a data point in the per-person penalty graph reveals the penalty that caused the jump (icon, name, amount, time).

## Plan

- [ ] Add a "🏆 Spiele" stat card to `EveningDonutChart`, mirroring the existing 🍺 / 🥃 cards. The whole card is clickable and opens a new `GamesDetailSheet`.
- [ ] New `GamesDetailSheet` component:
  - Lists every game ordered by `sort_order`.
  - For each game: name (with 🏆/👑 markers), status badge (open / running / finished), winner name, start/finish time, per-player scores, throw-count + avg pins for finished games.
  - Empty state when no games exist.
- [ ] Make penalty dots on `CumulativeChart` clickable:
  - Extend `ChartSeries.events` with the source `PenaltyLogEntry` (only for penalty series; drink series stays inert).
  - Track a `selectedEvent` in `EveningTimeline`; clicking a dot selects it, clicking again deselects.
  - Render an info row beneath the chart with: time, player name, icon + penalty type, amount.
- [ ] Add i18n keys for the new UI strings (de + en).
- [ ] Run `cd frontend && npm run build` to verify types.
- [ ] Update Feature Roadmap row in CLAUDE.md (Feature #7 stats notes).

## Notes

- Game data is already on `evening.games` so no backend changes needed.
- Penalty entry source is already in `evening.penalty_log`; the cumulative chart can re-use that reference.
- Keep the design language: `kce-card`, amber accents, small/uppercase muted labels.

## Review

- Added new **🏆 Spiele**-Karte to `EveningDonutChart` (right-hand column next to 🍺/🥃 and in the no-data 2-col grid). Card shows `finished/total` count, opens `GamesDetailSheet`.
- New `GamesDetailSheet` lists every game sorted by `sort_order`: name with 👑 opener marker, status pill (Offen/Läuft/Fertig), winner row, started/finished times, scores sorted desc with 🏆 winner highlight, throw stats (total pins, throw count, avg) for finished games, optional note. Empty state when no games.
- Extended `ChartSeries.events` with optional `entry: PenaltyLogEntry`. Penalty events now carry their source entry; drink events stay unchanged so drink dots remain inert.
- `CumulativeChart` accepts `selected` + `onSelect`. Each penalty dot has a wider transparent hit target, grows to `r=4.5` when selected. Clicking the SVG background clears the selection.
- `EveningTimeline` tracks the selected point and renders an info row beneath the penalty chart: timestamp, player name (in player color), penalty icon + type, amount. When nothing is selected, a small muted hint asks the user to tap a dot.
- i18n: added `stats.games`, `stats.gamesDetail`, `stats.gameStatusOpen/Running/Finished`, `stats.tapPenaltyDot`, `stats.scores` to both `de.ts` and `en.ts`.
- Docs: updated `docs/docs/funktionen/statistiken.md` with new Abend-Detail section. README "Statistics" bullet expanded.
- CLAUDE.md Feature #7 row updated.
- Build: `npm run build` clean. Vitest StatsPage (33) + i18n parity (4) tests pass.

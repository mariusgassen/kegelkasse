# Roadmap #65 — Abend-Modus (Live-Takeover) — core iteration

When an evening is live, the app pivots into an immersive live cockpit instead of "one tab of
several". This PR delivers the core: a Live sub-tab (default when active) with a live scoreboard
header, an event ticker, and thumb-sized quick actions. Reuses existing SSE/polling + mutation
flows; no new backend.

## Plan
- [ ] lib/liveEvening.ts — pure: currentGameState (running game, active/next player, last throw),
      buildEventFeed (penalties+drinks+highlights, newest-first), eveningTotals
- [ ] lib/__tests__/liveEvening.test.ts
- [ ] components/evening/LiveEveningView.tsx — scoreboard + ticker + quick actions + stat row
- [ ] EveningHubPage: add 'live' first sub-tab, default when active & not closed; wire quick actions
      (Strafe/Runde → quick entry overlay, Highlight → highlights tab, Spiele → games tab)
- [ ] Vitest for LiveEveningView
- [ ] i18n live.* keys (de + en)
- [ ] docs (abende.md or new) + README + CLAUDE.md roadmap #65 status/notes
- [ ] version bump (MINOR)

## Notes / deliberate scope
- Throw-level ticker items (incl. Alle Neune) need per-throw timestamps the API doesn't expose;
  the scoreboard surfaces the live throw state instead of faking chronological order in the ticker.
- Full bottom-nav "Abend / Rest" reduction deferred (RootLayout nav has high test blast radius,
  carefully tuned in #63) — the Live sub-tab + router landing already deliver the takeover feel.

## Review
(to be filled in)

## Review (done)
- lib/liveEvening.ts pure helpers + 18 Vitest tests.
- components/evening/LiveEveningView.tsx (scoreboard + stat row + quick actions + ticker) + 8 tests.
- EveningHubPage: 'live' first sub-tab, default when active & not closed; effectiveTab fallback to
  penalties when closed; LiveEveningView mounted only when active (stateless).
- i18n live.* keys (de + en), parity green. docs abende.md; README; CLAUDE.md #65 → in progress with notes.
- version 1.34.0 → 1.35.0. tsc clean; full suite 2152/2152 green.

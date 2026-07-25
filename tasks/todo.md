# Roadmap #67 — Kasse: Blick vs. Analyse

Branch: `claude/roadmap-continuation-l07lyz`

Untangle the 2.289-line, 33-`useState` Kasse overview into two levels:
**Blick** (one card per core question) and **Analyse** (drill-in destination).

## Context
The Übersicht tab currently stacks: Mein Konto → Spieler-Filter (collapsed) → Kassenstand-Hero
with expandable flow rows + help explainer (collapsed) → Verlauf-Graph → Offen/Guthaben tiles →
debtor/credit/settled/guest lists. Several "collapsed by default" cards hide density rather than
structure it — exactly what #67 says to replace with real information architecture.

The player filter (with the write-off / refund / share **removal simulation**) is an admin power
tool, but today it globally rescopes the member-facing hero and lists.

## Plan
- [x] `components/treasury/BalanceHistoryChart.tsx` — extract the chart (was inline in the page)
- [x] `components/treasury/TreasuryAnalysis.tsx` — new Analyse view; owns its own queries
      (same query keys → react-query dedupes), filter state, flow breakdowns and the chart
- [x] `TreasuryPage.tsx`: new `analysis` tab; Übersicht becomes the glance level
      (Mein Konto / Was ist in der Kasse? / Wer schuldet noch?), always on **unfiltered** balances
- [x] Filter + simulation + itemized flow breakdowns live in Analyse only, scoping Analyse only
- [x] i18n `treasury.tab.analysis`, `treasury.analysis.*`, `treasury.whoOwes` (de first, then en)
- [x] Tests: move filter/chart suites to the analysis tab, add glance/analysis tests
- [x] Docs (`docs/docs/funktionen/kasse.md`, README, CLAUDE.md #67) + version bump 1.42.0
- [ ] Push + PR

## Review

Split the Kasse into a glance level and an analysis destination.

- **New `analysis` tab** (🔬 Analyse) between Übersicht and Konten. Übersicht answers the three
  core questions and nothing else; Analyse holds the tooling that interprets those numbers.
- **`components/treasury/TreasuryAnalysis.tsx`** (new) — owns the player filter + leaving-member
  simulation, the money flow with per-row booking breakdowns, and the balance-history graph. It
  reads through the same query keys as the page, so react-query serves it from cache.
- **`components/treasury/BalanceHistoryChart.tsx`** (new) — the chart lifted out of the page
  verbatim (behaviour unchanged), now testable on its own.
- **`TreasuryPage.tsx` 2.289 → 1.621 lines**, 55 → 43 `useState`. Gone from the page: the filter's
  6 state hooks, `flowDetail`, `showBalanceFilter`, the history scope/member state and its three
  queries, the 4 breakdown derivations, `effectiveBalances`, `shareOut`, all `filtered*` splits.
- **Behaviour change (intended):** the filter no longer rescopes the Übersicht. Members always see
  the club's real figures; an admin's what-if stays in the tab they opened for it. The Übersicht
  keeps the same flow *figures* (static rows, `glance-amount-*`) plus a link into Analyse.
- Übersicht's "Wer schuldet noch?" heading now fronts the open/credit tiles and the debtor,
  credit, settled and guest lists, so they read as one answer instead of five stacked sections.

Verified: `tsc --noEmit` clean, `eslint` 0 errors on changed files, full Vitest suite 2261/2261
green (85 files) — run in full here because the refactor touched the app's largest page.

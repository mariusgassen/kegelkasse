# Feature: Modern app-shell overhaul (bottom nav, side rail, motion, focus states)

## Goal
Modernize the UI foundation every page inherits — navigation placement, design tokens,
interaction feedback — without rewriting individual pages:
- Bottom tab bar on mobile (thumb reach, platform standard) instead of nav squeezed into the header.
- Same nav element becomes a left side rail on ≥lg screens (desktop/tablet finally uses its width).
- Page-switch enter transition, pressed states, global keyboard focus rings.
- Design token polish: card radius/elevation, sheet radius, frosted nav, micro-type bump in shell.
- Respect `prefers-reduced-motion`.

## Tasks
- [x] `index.css`: `.app-shell` grid (header/main/nav areas; lg → nav column), `.app-nav`
      (frosted bottom bar / lg side rail), `.nav-btn` redesign (larger, pressed state, lg row layout),
      `.page-pane` enter animation + reduced-motion guard, global `:focus-visible` ring,
      card/sheet radius + elevation polish, field-label 10→11px.
- [x] `App.tsx`: restructure root to grid shell; nav moves out of `<header>` below `<main>`;
      icon size 16→20; remove fake gradients; subtitle 9→10px.
- [x] Vitest: nav outside header, nav after main in DOM order, 7 `.page-pane` wrappers (App.test.tsx).
- [x] Version bump `frontend/package.json` 1.31.0 → 1.32.0 (MINOR).
- [x] Docs: README layout bullet, `docs/docs/erste-schritte.md` navigation note, CLAUDE.md roadmap row #63.
- [x] Push, PR, subscribe, watch CI.

## Review

Implemented as planned; no scope changes.

- Single `<nav class="app-nav">` element repositions itself purely via CSS grid areas —
  bottom bar on mobile, side rail ≥1024px — so role-filtered nav tests and label queries
  keep matching exactly one node.
- Page-enter animation rides on the existing display:none toggle (display flip restarts
  CSS animations), so no JS/router changes were needed for transitions.
- Focus rings via global `:focus-visible` (keyboard-only, no touch noise).
- Full frontend suite green locally (2090/2090, incl. 3 new App shell tests) + `npm run build` clean;
  lint left to CI per project policy.

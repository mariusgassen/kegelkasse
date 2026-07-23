# Roadmap #66 — Start-Dashboard „Für dich"

Personalized landing page (default when no active evening), composed purely from existing
endpoints (schedule, my-balance, committee, stats/me). No backend, no migration.

## Plan
- [ ] lib/dashboard.ts — pure helpers (nextAppointment, recentCommunity, balanceState, recentThrowAvgs)
- [ ] lib/__tests__/dashboard.test.ts — Vitest for the pure helpers
- [ ] pages/HomePage.tsx — the dashboard
- [ ] pages/__tests__/HomePage.test.tsx — Vitest for the page
- [ ] router.tsx — add /home route + typed search; index redirect: active evening → /evening else /home
- [ ] lib/legacyHash.ts — add home to ROUTE_PAGES
- [ ] RootLayout.tsx — add Home nav entry (first, all roles)
- [ ] App.test.tsx — mock HomePage
- [ ] i18n nav.home + home.* keys (de + en)
- [ ] docs + README + CLAUDE.md roadmap #66 → done
- [ ] version bump (MINOR) in frontend/package.json

## Review
(to be filled in)

## Review (done)
- Added `lib/dashboard.ts` pure helpers + 14 Vitest tests.
- Added `pages/HomePage.tsx` (dashboard) + 11 Vitest tests.
- Router: `/home` route + typed permissive `HomeSearch`; index redirect active-evening→/evening else /home.
- `home` added to `ROUTE_PAGES`; 🏠 nav tab (first, all roles) in RootLayout.
- App.test: HomePage mock (index redirect lands on /home in tests).
- i18n `nav.home` + `home.*` keys (de + en), parity green.
- Docs page + sidebar; README catalog; CLAUDE.md roadmap #66 → ✅; version 1.33.0 → 1.34.0.
- `tsc --noEmit` clean; full Vitest suite 2126/2126 green.

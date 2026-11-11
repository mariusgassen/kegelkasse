# Fix: scrolling on the map will cause the pull to refresh to be activated

## Problem
In `RootLayout.tsx`, `usePullToRefresh` is attached to `<main>`. When a user navigates to the Sticker Wall map (`tab === 'map'`) or opens the sticker location picker map, the Leaflet map is placed inside a `.page-scroll` container.
Because the scroller is at `scrollTop === 0`, touch gestures on the map (panning/scrolling the map downwards) bubble up to `<main>` and trigger `usePullToRefresh`, pulling the entire page down and activating a page refresh instead of panning the map.

## Plan
- [x] 1. Update `usePullToRefresh.ts`:
  - Check `e.touches.length === 1` in `onTouchStart` and `onTouchMove` (ignore multi-touch/pinch).
  - Check `target.closest('.leaflet-container, [data-no-ptr], [data-prevent-ptr]')` in `onTouchStart` and return early if matched.
- [x] 2. Update `StickerMap.tsx` and `StickersPage.tsx`:
  - Add `data-no-ptr` to the `StickerMap` container element and `MapBox` wrapper.
  - In `index.css`, ensure `.leaflet-container` has `overscroll-behavior: contain`.
- [x] 3. Tests:
  - Add test in `usePullToRefresh.test.tsx` verifying drags on `.leaflet-container` or `[data-no-ptr]` do not activate pull-to-refresh.
  - Add test in `usePullToRefresh.test.tsx` verifying multi-touch gestures are ignored.
- [x] 4. Verification:
  - Run `npm test` and `npm run build` in `frontend/`.

## Review
- Modified `usePullToRefresh.ts` so touches originating inside maps (`.leaflet-container`) or elements opting out (`[data-no-ptr]`, `[data-prevent-ptr]`) are excluded from pull-to-refresh.
- Multi-finger touches (pinch-to-zoom gestures) are ignored on touchstart and cancel any ongoing pull on touchmove.
- Added `data-no-ptr` to `StickerMap` and `MapBox` container in `StickersPage`.
- Added `overscroll-behavior: contain` to `.leaflet-container` in `index.css`.
- Added unit tests in `usePullToRefresh.test.tsx` verifying map interactions, `data-no-ptr` elements, and multi-touch behavior.

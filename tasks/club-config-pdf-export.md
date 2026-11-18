# Club settings PDF export

## Goal
Let a club admin download the club's configured settings as a printable PDF. Penalty types are the core
of the document; general settings, game templates, teams and pins round it out. No backend change needed:
the existing admin-only `GET /club/config/export` JSON bundle is the data source, and the PDF is built in
the browser with the same pdfcn/Forme stack already used for the Kassenbericht. Secrets and personal data
stay excluded (same bundle as before).

## Plan
- [x] 1. Fetch `origin/main`, create branch `claude/export-club-settings-document` + worktree, clarify scope with user.
- [x] 2. Add `frontend/src/lib/clubConfigPdf.tsx`: pure formatters (`soundLabel`, `configEuro`, `yesNo`) and `renderClubConfigPdf(bundle, branding?)` using pdfcn primitives. Penalty types lead, then general settings, game templates, teams, pins. Reuse the existing report branding.
- [x] 3. Add `api.downloadClubConfigPdf()` to `frontend/src/api/client.ts`: reuse `exportClubConfig()`, lazy-import the renderer, load club branding, build the blob and trigger a download.
- [x] 4. Add a full-width "Als PDF exportieren" button to `ClubConfigCard` in `frontend/src/pages/ClubAdminPage.tsx` plus `club.config.exportPdf` keys in `de.ts`/`en.ts`.
- [x] 5. Add Vitest coverage: `frontend/src/lib/__tests__/clubConfigPdf.test.tsx` (formatters + real PDF bytes), an API-client test for the download, and a ClubAdminPage test that the button calls `api.downloadClubConfigPdf()`.
- [x] 6. Run targeted Vitest suites, ESLint and `npm run build`; review the diff for consistency and scope.

## Review
- Verified: targeted Vitest suites pass (3 files, 244 tests).
- Verified: `npm run lint` — 0 errors (only the repo's pre-existing `no-explicit-any` warnings).
- Verified: `npm run build` — clean after removing a stray `map_style` field that is not part of `ClubConfigSettings` (it lives on `Club.settings`, not on the config bundle).
- Diff scope: frontend only, no backend/i18n-doc changes beyond the two new keys.

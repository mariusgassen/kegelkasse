# Feature: Personalized Email Digest

## Goal
Per-user email digest (frequency: off/daily/weekly/monthly), personalized, with:
- Changes since last digest: evenings added/changed, personal penalties, personal bookings,
  community news (comments & reactions).
- Personal account & balance overview.
- Deep links to every entry.
- Themed email design (club colors) + recipient locale.

## Backend
- [ ] Migration 051: `user.last_digest_at` (DateTime, nullable)
- [ ] `core/i18n.py`: minimal DE/EN string table + localized date formatting for emails
- [ ] `core/email.py`: club theming helper; theme existing notification email; `build_digest_email()`
- [ ] `core/digest.py`: `build_digest()`, due logic, `send_user_digest()`, `send_all_digests()`
- [ ] `core/scheduler.py`: daily digest job (08:00)
- [ ] `api/v1/push.py`: preferences include `digest_frequency`; `POST /push/digest/test`
- [ ] pytest: digest builder, due logic, preference persistence, test endpoint

## Frontend
- [ ] types.ts: `digest_frequency` on PushPreferences
- [ ] ProfileSheet: digest frequency selector + "send now" test
- [ ] i18n de.ts/en.ts: `digest.*` keys
- [ ] Vitest: ProfileSheet digest selector + api client

## Docs
- [ ] docs/docs, README, CLAUDE.md roadmap (#8)

## Review

Implemented end-to-end.

Backend:
- Migration 051 adds `user.last_digest_at`.
- `core/i18n.py` — tiny DE/EN table + `format_date`/`format_money`/`t` (system-locale independent).
- `core/email.py` — `email_theme(club)` (brand color + contrast text + logo), branded header on all
  emails, `build_email_bodies` now themed + localized, new `build_digest_email`.
- `core/digest.py` — due logic, `build_digest` (evenings / personal penalties / bookings / community,
  each deep-linked, capped at 15/section), account overview, empty-skip, `send_all_digests`.
- `core/scheduler.py` — daily digest job at 08:00.
- `core/push.py` + `club.py` — notification/broadcast/test emails now pass club theme + recipient locale.
- `api/v1/push.py` — `digest_frequency` in preferences (validated), `POST /push/digest/test`.
- pytest: `test_digest.py` (16) green; existing email/push/reminder/club suites still green.

Frontend:
- `DigestFrequency` type, `api.sendTestDigest`, ProfileSheet digest card (freq pills + send-now test),
  i18n `digest.*` (de+en parity).
- Vitest: 4 ProfileSheet digest tests + 1 api-client test; full ProfileSheet+apiMethods suites green;
  lint 0 errors, build clean.

Design decisions:
- Digest is opt-in (default `off`) — no surprise emails.
- Empty digests are skipped; the manual "send now" still shows the account overview (force).
- Deep links render as absolute URLs only when `APP_BASE_URL` is set (a bare `/#...` href is useless
  in mail); text body stays complete regardless.
- Emails keep a light, readable body with the brand color used for the header band / buttons / accents
  (safer across mail clients than a full dark theme).

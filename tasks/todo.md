# Email Notifications (off / push / email) + per-club SMTP

## Goal
- Per-club email server config (SMTP), stored in `ClubSettings.extra["email"]` (no migration — matches reminders pattern).
- Every notification (incl. reminders) can be delivered via email.
- Per-user, per-category channel toggle: **off / push / email** (replaces the boolean toggle).
- Admin can send a test email.

## Backend
- [ ] `core/config.py`: add `APP_BASE_URL` (for absolute links in emails).
- [ ] `core/email.py` (new): `get_club_email_config`, `send_club_email` (smtplib, SSL/STARTTLS), `build_email_bodies`.
- [ ] `core/push.py`: channel resolution `_user_channel`; unified `notify_user`; make push_to_* channel-aware.
- [ ] `core/reminders.py`: `send_upcoming_evening_reminders` → use `notify_user` (email-aware).
- [ ] `api/v1/push.py`: prefs accept channel strings (normalize legacy bool); `/push/status` → `email_configured`.
- [ ] `api/v1/club.py`: `GET/PATCH /club/email-settings` + `POST /club/email-settings/test` (admin).

## Frontend
- [ ] `types.ts`: `NotificationChannel`; `PushPreferences` values → channel.
- [ ] `api/client.ts`: email settings methods; push status +email_configured.
- [ ] `ProfileSheet.tsx`: `ChannelToggle` (off/push/email), email segment only when configured.
- [ ] `ClubAdminPage.tsx`: `EmailSettingsCard` (SMTP form + test).
- [ ] `i18n/de.ts` + `en.ts`: new keys.

## Tests
- [ ] pytest: email config/send (mock smtplib), endpoints, channel resolution, prefs normalization, dispatch email path.
- [ ] Vitest: ChannelToggle, api client email methods, i18n parity.

## Docs
- [x] `docs/docs/funktionen/push.md`, `README.md`, CLAUDE.md roadmap.

## Review (done)
- Per-user, per-category channel (off/push/email) — stored in `push_preferences`, backwards compatible with old booleans (`_normalize_prefs`, `_user_channel`).
- Unified dispatch `core/push.py::notify_user`; all `push_to_*` + `send_upcoming_evening_reminders` route through it. Log-to-bell preserved (except 'off').
- Per-club SMTP in `ClubSettings.extra["email"]` (no migration). `core/email.py` = config/send/body helpers (smtplib, STARTTLS/SSL). `APP_BASE_URL` for absolute email links.
- Admin endpoints: GET/PATCH `/club/email-settings` (password never returned), POST `/club/email-settings/test`. `/push/status` → `email_configured`.
- Frontend: `ChannelToggle` (🔕/🔔/✉️) in ProfileSheet (email segment gated on config); `EmailSettingsCard` in ClubAdminPage; i18n de/en.
- Tests: backend 859 pass (incl. new `test_email.py`, 22); frontend 2039 pass (incl. ChannelToggle + EmailSettingsCard + api methods). Build + ruff + eslint clean.
- Version bumped 1.26.7 → 1.27.0.
- Note: "Announcements" (committee category) intentionally stays always-on push (not channel-toggleable), preserving prior product decision.

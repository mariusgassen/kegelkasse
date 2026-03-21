# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kegelkasse Kegelclub Manager — a full-stack 9-pin bowling club management PWA.
Manages clubs, evenings, games, penalties, member rosters, and treasury with offline-first capabilities and
German/English i18n.

## Development Commands

### Backend

```bash
# Start dev environment
docker compose -f docker-compose.dev.yml up -d

# Run migrations
docker compose exec app alembic upgrade head

# Seed initial superadmin
docker compose exec app python -m app.scripts.create_admin

# API docs available at http://localhost:8000/api/docs
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # Dev server at :5173
npm run build    # TypeScript check + Vite production build
npm run preview  # Preview production build
```

### Environment

```bash
cp .env.example .env
# Required: DATABASE_URL, SECRET_KEY, FIRST_SUPERADMIN_EMAIL, FIRST_SUPERADMIN_PASSWORD
```

## Architecture

**Backend:** FastAPI + PostgreSQL + SQLAlchemy ORM + Alembic migrations. Runs inside Docker. API versioned at
`/api/v1/`. Serves the React SPA as static files in production (mounts build to `/assets`, fallback to `index.html`).

**Frontend:** React 18 + TypeScript + Vite. State via Zustand (persists `user` and `activeEveningId`). REST API calls
with JWT Bearer auth via `frontend/src/api/client.ts`. Real-time updates via 30s polling on the evening page. PWA with
service worker + IndexedDB for offline support.

**Auth flow:** JWT tokens, bcrypt passwords, invite-based registration (one-time tokens). Three roles: `superadmin`,
`admin`, `member`.

## Key Files

| File                             | Purpose                                                     |
|----------------------------------|-------------------------------------------------------------|
| `backend/app/main.py`            | FastAPI app setup, route registration, CORS, static serving |
| `backend/app/core/config.py`     | Environment settings                                        |
| `backend/app/core/security.py`   | JWT + password hashing                                      |
| `backend/app/api/deps.py`        | Auth dependencies, role checks                              |
| `backend/app/api/v1/evenings.py` | Main business logic (games, penalties, drinks, players)     |
| `backend/alembic/versions/`      | Numbered migrations (001–010 done)                          |
| `frontend/src/App.tsx`           | Router, header, nav, boot/auth flow                         |
| `frontend/src/store/app.ts`      | Zustand store, role helpers                                 |
| `frontend/src/api/client.ts`     | All API calls                                               |
| `frontend/src/types.ts`          | Shared TypeScript interfaces                                |
| `frontend/src/i18n/de.ts`        | German translations (source of truth for keys)              |
| `frontend/src/i18n/en.ts`        | English translations (must stay in sync with de.ts)         |
| `frontend/vite.config.ts`        | Vite + PWA config, API proxy                                |

## Data Model

- `Club` → `RegularMembers`, `PenaltyTypes`, `GameTemplates`, `Evenings`, `ClubTeams`
- `Evening` → `EveningPlayers`, `Teams`, `Games`, `PenaltyLog`, `DrinkRounds`
- `EveningPlayer.is_king` — set on the Eröffnungsspiel winner (one per evening)
- `Game.status` — `open` → `running` → `finished`
- `Game.started_at` / `finished_at` — timestamps for game timing
- `PenaltyLog.game_id` — FK to Game for auto-created loser penalties
- `PenaltyLog.regular_member_id` — FK to RegularMember for absence entries
- `PenaltyLog.unit_amount` — default_amount frozen at log time (retroactive-safe for count mode)
- `ClubSettings.extra` JSON — stores `bg_color`, `guest_penalty_cap`
- Soft deletes via `is_deleted` flag on `Game` and `PenaltyLog`
- `Evening.is_closed` archives to history

## Coding Conventions

- **i18n:** All UI strings via `useT()`. Add keys to `de.ts` first, then `en.ts`. Keys follow `scope.sub.key` naming.
- **Admin guards:** `require_club_admin` in backend deps, `isAdmin(user)` check or `<AdminGuard>` in frontend.
- **Migrations:** One file per DB change, numbered sequentially (`NNN_description.py`). Never modify existing
  migrations.
- **API client:** All fetch calls in `frontend/src/api/client.ts`. Return types are TypeScript interfaces from
  `types.ts`.
- **Sheets:** Bottom-sheet dialogs via `<Sheet open onClose title onSubmit>`. Escape key closes automatically.
- **Toasts:** Errors via `showToast(message)`.
- **Store:** Zustand store in `store/app.ts`. Only persists `user` and `activeEveningId`. Other data (penaltyTypes,
  etc.) is populated at boot and not persisted.
- **Game loser penalties:** Always created via `finish_game` endpoint (not `add_game`). Identified by
  `penalty_log.game_id`. On re-edit: old penalties deleted, new ones created.
- **Docs & README & CLAUDE.md:** Whenever a user-facing feature is added or changed, update the relevant page(s) in
  `docs/docs/`, the feature catalog in `README.md`, **and** the Feature Roadmap table in `CLAUDE.md` (status, notes).
  Keep all three in sync with the implementation. Do this **before committing** — never skip it, even for small changes.
- **Linting & build:** Always run `cd frontend && npm run build` locally before every push to catch TypeScript errors
  early. Fix all errors before pushing. Also run `cd backend && poetry run ruff check app/` locally before every push to catch Python linting errors — fix all issues before pushing. Do NOT run `eslint` locally — check that via CI after pushing.
- **Backend dependencies:** Whenever `backend/pyproject.toml` is changed (adding, removing, or updating a package),
  immediately run `cd backend && poetry lock` to regenerate `poetry.lock` and commit both files together.
- **Design consistency:** Apply the established design system everywhere and immediately — tabs, sheets, top-level
  page elements, dialogs, and any new components. Never leave new UI without consistent styling.
- **Display names:** Always show the Kegelname (nickname) as the primary display name for members. Use
  `member.nickname || member.name` everywhere a member name is shown — including dropdowns, select options, filter
  chips, list cards, alerts, and any other UI that references a member. In components linked to a `User`, look up the
  linked `RegularMember` via `user.regular_member_id` in the `regularMembers` store to get the nickname. Never display
  `member.name` alone when a nickname exists.
- **"Ich" label:** In every list or card that shows members/players, add a small amber `Ich` badge
  (`<span className="text-[9px] text-kce-amber font-bold">Ich</span>`) next to the current user's entry. Compare
  `regular_member_id === user?.regular_member_id` (or `user.id` for `AppUser` lists). Exception: pure rankings
  (e.g. annual penalty ranking) keep their sorted order but still show the `Ich` badge.
- **Current user first:** In non-ranking lists (players, members, accounts, rosters), always sort the current user's
  entry to the top. Use `.sort((a, b) => { if (a.xxx === myId) return -1; if (b.xxx === myId) return 1; return 0 })`.
- **Sync mutations:** After any mutation (create, update, delete), immediately trigger a re-fetch of all affected
  lists/data so other clients (and the current client) see the updated state without manual refresh. Use the existing
  polling mechanism or invalidate relevant queries right after the API call resolves.
- **UI invalidation:** Whenever a data entry changes, always invalidate and reload the affected list(s) in the UI.
  Never rely on local optimistic state alone — always confirm with a fresh server response.
- **Data dependency invalidation:** When creating data X that other queries depend on, always invalidate those
  dependent queries immediately. Examples: creating a `PaymentRequest` → invalidate `['payment-requests']` and
  `['my-payment-requests']`; confirming a request → also invalidate `['my-balance']` and `['my-payment-requests']` so
  the member's profile view stays in sync without a manual refresh.

## Deployment

Push to Git → Coolify builds Docker Compose. The `docker/entrypoint.sh` auto-runs migrations and admin seed on container
start. No manual migration steps needed in production.

## Feature Roadmap

Status: ✅ Done · 🚧 In Progress · ⬜ Planned

| #  | Feature                            | Status | Notes                                                                                                 |
|----|------------------------------------|--------|-------------------------------------------------------------------------------------------------------|
| 1  | **Spiele**                         | ✅      | Status-Flow (open→running→finished), König-Flag, Verlierer-Strafen                                    |
| 2  | **Strafen-Log Anreicherung**       | ✅      | Spiel-Kontext-Label, Spieler-Filter-Chips                                                             |
| 3  | **Kasse**                          | ✅      | Ranking, Spiele/Getränke, Text-Export (Share/Copy)                                                    |
| 4  | **Mitglieder-Konten & Abrechnung** | ✅      | member_payment Tabelle, Salden-Endpoint, Zahlungen in MembersPage                                     |
| 5  | **Historie**                       | ✅      | Detail-Ansicht, Wiedereröffnen, Löschen, Nachtragen-Sheet; Wiedereröffnen blockiert wenn anderer Abend offen |
| 6  | **Eigene Historie / Profil**       | ✅      | Persönliche Jahresstatistiken im Profil (Strafen, Abende, Siege, Bier)                                |
| 7  | **Statistiken & Analyse**          | ✅      | Jahresranking mit CSS-Balken, Jahresauswahl, alle Mitglieder ein-/ausklappbar                         |
| 8  | **Push Notifications**             | ✅      | Web Push mit Deep Links; Kategorien-Präferenzen pro User; 4 neue Trigger (König, Abend start, neue Mitglieder, Strafe storniert); VAPID-Backend, ProfileSheet-Toggle+Prefs, SW-Handler; Missed-push-Speicherung in IndexedDB bei geschlossener App; Hybrid-Ladeweg via notification_log (Migration 035): Benachrichtigungen werden server-seitig gespeichert und beim App-Start über API geladen (auch ohne PWA/SW); Deep-Link-Fix (absolute URL in SW navigate()); Glocke immer sichtbar für eingeloggte User |
| 9  | **Offline-Sync**                   | ✅      | IndexedDB-Queue für Strafen/Getränke; OfflineQueuedError; Auto-Flush on reconnect; /sync/-Handler    |
| 10 | **Logo-Upload**                    | ⬜      | Admin-Upload für Vereinslogo, Docker Volume                                                           |
| 11 | **Emoji Picker**                   | ✅      | `emoji-picker-react` v4, EmojiPickerButton-Komponente, Icon- & Insert-Modus, 5 Verwendungen         |
| 12 | **Ausflug / Gastvereine**          | ⬜      | Club-Vernetzung, Gast-Clubs                                                                           |
| 13 | **Präsident**                      | ✅      | Jährliches Präsidentenspiel (🎯-Flag), club_president-Tabelle, Historie-Badge, Präsidenten-Tab       |
| 14 | **Filter**                         | ⬜      | Filter bei listen - Suchfeld das inhalt nach matches in verschiedenen feldern der objecte filtert.    |
| 15 | **Bonus**                          | ⬜      | Gamification, Ankündigung, Kassenstand                                                                |
| 30 | **Vergnügungsausschuss**           | ✅      | VA-Mitglieder (is_committee Flag), Kegelfahrten (club_trip), Ankündigungen (club_announcement) mit Push; Migrationen 032–034; 🚌-Tab für alle; VA-Verwaltung im Verein-Tab |
| 16 | **Cleanup / Fehlerhandling**       | ⬜      | Prüfung ob relevante Stellen fehler unbekannt und bekannt behandelt und dem benutzer angezeigt werden |
| 17 | **Logging**                        | ⬜      | Backend Logs hinzufügen mit konfigurierbarem level für Monitoring                                     |
| 32 | **Datenbank-Backups**              | ✅      | pgbackrest in custom db-Image (postgres:16 + pgbackrest + Python mgmt-server auf :8089); WAL-Archivierung → PITR; APScheduler-Cron-Job Full-Backup; Superadmin-Tab: Backup-Liste (Label, Typ, Größe, PITR-Fenster), Manuell auslösen; Retention per PGBACKREST_REPO1_RETENTION_FULL; S3 via PGBACKREST_REPO1_* env-vars |
| 18 | **Testing**                        | ⬜      | Automatisierte Tests für Frontend und Backend                                                         |
| 19 | **Bezahllink**                     | ✅      | PayPal.me-Link im Profil, Zahlung melden (PaymentRequest), Admin bestätigt/lehnt ab in Kasse        |
| 20 | **Abwesenheiten verwalten**        | ✅      | Spieltermine & RSVP (SchedulePage); Abwesenheitsstrafen auto beim Start-aus-Termin; no_cancel_fee nur wenn RSVP vorhanden; Gäste ohne regular_member_id werden beim Start automatisch als RegularMember angelegt |
| 21 | **Schulden-Erinnerungen**          | ✅      | APScheduler (tägl. 09:00); 5 Typen: Schulden wöchentlich, Kegeln in X Tagen (per-user), RSVP, Schulden am Kegeltag, Zahlungsanfragen-Nudge; Toggle-Fix; Broadcast-Push; Admin-Konfiguration in ClubAdminPage |
| 22 | **Import / Export**                | ⬜      | CSV/Excel-Export und -Import für Kasse, Buchungen und Mitglieder-Konten                               |
| 23 | **Pins**                           | ✅      | Vereinsnadeln: Träger zuweisen, Abend-Alert bei anwesendem Träger, Strafe per Knopfdruck eintrabar; PinsAlert zeigt ✓ wenn Strafe bereits eingetragen; Pin-Icons neben Kegelname; Präsident-Badge (🎯) ebenfalls inline |
| 24 | **iCal Export**                    | ✅      | Öffentlicher Abo-Link (webcal://) mit Secret-Token; Uhrzeit pro Termin; Club-Standard 20:00; 3 Migrationen (022–024); Soft-Delete von Terminen (STATUS:CANCELLED im Feed, Migration 029) |
| 25 | **Bug-Fixes Batch 1**              | ✅      | Statistiken-Label, leere Spiele-State, Teamzuordnung, Vergangenheitsdatum, Abend-Doppelstart, Quick-Start, Strafendatum (Admin), Ausgaben-Datum (Migration 028) |
| 26 | **Bug-Fixes Batch 2**              | ✅      | TreasuryPage Buchungen-Datum konsistent rechts (unter Betrag) für alle Eintragstypen; NotificationPanel markAllRead in useEffect (React-Renderbug); leere-Benachrichtigungen-Hinweis |
| 27 | **Highlights**                     | ✅      | Abend-Highlights erfassen (✨): evening_highlight-Tabelle, CRUD-Endpoints, Freitext-Input am Abend; Migration 030 |
| 28 | **Abend nur via Termin starten**   | ✅      | create_evening auf require_club_admin gesetzt; ad-hoc-Formular bleibt für Admins erhalten             |
| 29 | **Tablet Schnellerfassung**        | ✅      | Vollbild-Overlay (⚡) für Landscape-Modus; 3-Spalten-Layout: Spieler | Strafen | Getränke (separat); iOS safe-area-insets (Notch, Home-Indicator, gerundete Ecken); kein Scrollen erforderlich; letzte Einträge unten |
| 31 | **Navbar-Farben & Farbpalette**    | ✅      | Navbar nutzt CSS-Variablen (--kce-surface2, --kce-border, --kce-primary); Live-Vorschau bei Farbänderung; Paletten-Generator in Erscheinungsbild: Grundfarbe wählen + Vorschläge (Warm/Kontrast/Triade/Weich) oder Zufallspalette |

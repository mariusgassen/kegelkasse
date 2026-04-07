# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how


## Task Management

1. Plan First: Write plan to `tasks/todo.md` with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to `tasks/todo.md`
6. Capture Lessons: Update `tasks/lessons.md` after corrections


## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Only touch what's necessary. No side effects with new bugs.

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

**Frontend:** React 19 + TypeScript + Vite. State via Zustand (persists `user` and `activeEveningId`). REST API calls
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
- **Versioning:** A single semantic version (`MAJOR.MINOR.PATCH`) for the whole app lives in `frontend/package.json`
  (field `"version"`). It is injected at build time as `__APP_VERSION__` via `vite.config.ts` and displayed in the
  ProfileSheet footer. Bump the version in `package.json` with every release or significant feature:
  `MAJOR` for breaking changes, `MINOR` for new features, `PATCH` for bug-fixes. Never edit the displayed version
  elsewhere — always update `frontend/package.json` as the single source of truth.
- **Linting & build:** Always run `cd frontend && npm run build` locally before every push to catch TypeScript errors
  early. Fix all errors before pushing. Also run `cd backend && poetry run ruff check app/` locally before every push to catch Python linting errors — fix all issues before pushing. Do NOT run `eslint` locally — check that via CI after pushing.
- **Backend dependencies:** Whenever `backend/pyproject.toml` is changed (adding, removing, or updating a package),
  immediately run `cd backend && poetry lock` to regenerate `poetry.lock` and commit both files together.
- **Dependency freshness:** Always keep dependencies at their latest compatible versions. When Dependabot opens PRs,
  handle them promptly — merge safe patch/minor bumps directly, and perform major-version migrations immediately rather
  than deferring them. Do not let major-version upgrades accumulate. Known blocking constraints (document them inline):
  - `eslint-plugin-react-hooks@7.x` caps ESLint at `^9` → unblocks when a new release adds `^10` support.
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
- **Testing policy:** Every new feature **must** ship with tests — no exceptions, no deferred "add tests later".
  - **Backend:** Every new API endpoint gets a pytest test in `backend/tests/test_<module>.py`. Cover the happy path,
    auth/role guards (401 unauthenticated, 403 wrong role), and the main error cases (404, 400). Use the existing
    conftest fixtures (`db`, `club`, `user`, `auth_headers`) and add an autouse `cleanup` fixture that deletes all rows
    created by that test module in correct FK order (children before parents) and depends on `club` so it runs before
    club teardown.
  - **Frontend:** Every new utility function, store action, or pure logic module gets a Vitest test in a `__tests__/`
    sibling directory. Stubs/mocks go in `beforeEach`; always restore with `vi.unstubAllGlobals()` or `afterEach`.
    Page-level UI is lower priority but must be added when feasible.
  - **Run tests before committing:** `cd backend && poetry run pytest -q` must pass. `cd frontend && npm run build`
    must pass (also validates TypeScript). Fix failures before pushing — never push with a red test suite.

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
| 8  | **Push Notifications**             | ✅      | Web Push mit Deep Links; Kategorien-Präferenzen pro User; 4 neue Trigger (König, Abend start, neue Mitglieder, Strafe storniert); VAPID-Backend, ProfileSheet-Toggle+Prefs, SW-Handler; Missed-push-Speicherung in IndexedDB bei geschlossener App; Hybrid-Ladeweg via notification_log (Migration 035): Benachrichtigungen werden server-seitig gespeichert und beim App-Start über API geladen (auch ohne PWA/SW); Deep-Link-Fix (absolute URL in SW navigate()); Glocke immer sichtbar für eingeloggte User; Präzise Deep-Links: Kommentar/Reaktions-Benachrichtigungen navigieren direkt zum Sub-Tab + Item (scroll + Aufhell-Animation auf Kachel + Kommentar-Expand); URLs inkl. `item=ID&comment=ID`; unterstützte Typen: announcements, trips, highlights; `comments`-Präferenz deaktivierbar (Kommentar-Antworten + Reaktionen) |
| 9  | **Offline-Sync**                   | ✅      | Temp-ID-System: Abend offline starten (pendingStore + negative tempId), Gast-Member offline anlegen; flush rewrite tempId→realId in Pfaden und Bodies; IndexedDB-Queue für alle Abend-Mutations (Strafen, Getränke, Spiele, Spieler, Highlights, Teams, RSVP, …); navigator.onLine-Sofortcheck verhindert Hängen; OfflineQueuedError; Auto-Flush on reconnect; kegelkasse:temp-id-resolved Event; isPending-Badge im Abend; OfflineNotice + disabled Buttons für Admin/Finance-Bereiche |
| 10 | **Logo-Upload**                    | ✅      | Admin-Upload (JPEG/PNG/WebP/GIF/SVG, max 5 MB); POST /club/logo + DELETE /club/logo; Docker Volume club_uploads:/app/uploads; Serve via /uploads StaticFiles; Logo in App-Header statt animierter Kugel wenn gesetzt; Vorschau + Entfernen-Button in ClubSettingsTab |
| 11 | **Emoji Picker**                   | ✅      | `emoji-picker-react` v4, EmojiPickerButton-Komponente, Icon- & Insert-Modus, 5 Verwendungen         |
| 13 | **Präsident**                      | ✅      | Jährliches Präsidentenspiel (🎯-Flag), club_president-Tabelle, Historie-Badge, Präsidenten-Tab       |
| 14 | **Filter**                         | ✅      | Suchfelder in allen Listen-Ansichten: MembersPage (Name/Spitzname), HistoryPage (Datum/Lokal), TreasuryPage (Konten + Buchungen), StatsPage (Jahresranking nach Name), CommitteePage (Ankündigungen + Kegelfahrten nach Titel/Text) |
| 30 | **Vergnügungsausschuss**           | ✅      | VA-Mitglieder (is_committee Flag), Kegelfahrten (club_trip), Ankündigungen (club_announcement) mit Push; Migrationen 032–034; 🚌-Tab für alle; VA-Verwaltung im Verein-Tab |
| 16 | **Cleanup / Fehlerhandling**       | ✅      | Konsistente Fehlerbehandlung: alle catch-Blöcke verwenden toastError(); MembersPage + ProfileSheet korrigiert; toastError unterscheidet UnauthorizedError, OfflineQueuedError und generische Fehler |
| 17 | **Logging**                        | ✅      | Python stdlib logging mit LOG_LEVEL env-var (config.py); logging.basicConfig in main.py; strukturierte Logger in auth, evenings, scheduler, club, committee, superadmin, push, schedule, reports, backups; 5xx-Middleware-Logging |
| 32 | **Datenbank-Backups**              | ✅      | pgbackrest in custom db-Image (postgres:16 + pgbackrest + Python mgmt-server auf :8089); WAL-Archivierung → PITR; APScheduler-Cron-Job Full-Backup; Superadmin-Tab: Backup-Liste (Label, Typ, Größe, PITR-Fenster), Manuell auslösen; Retention per PGBACKREST_REPO1_RETENTION_FULL; S3 via PGBACKREST_REPO1_* env-vars |
| 18 | **Testing**                        | 🚧      | Vitest: cameraEngine (readFrame, digit/pin/lamp detection), turnOrder (alternating/block), API client (push, club, logo), alle Page-Komponenten (EveningPage, TreasuryPage, SchedulePage, HistoryPage, MembersPage, GamesPage, CommitteePage, ClubAdminPage, LoginPage, StatsPage, HistoryPage, ProfileSheet, TabletQuickEntryPage, CameraCapturePage). pytest: alle Backend-Endpunkte vollständig abgedeckt (379 Tests); push (preferences, debug, recent, mark-read, trigger-reminders), comments (edit, item-reactions), sync (add/delete penalty+drink), reports (xlsx+pdf), backups (mocked pgbackrest). Uncovered — see Testing-TODO below. |
| 33 | **Kamera-Wurf-Erkennung (Echtzeit)** | ✅    | Alle 4 Phasen implementiert. Architektur: Kamera-Gerät (Stativ, Kiosk-Modus) + Tablet (Schnellerfassung + Wurf-Management). CameraCapturePage: Kiosk-Modus (auto-submit, kein Bestätigungs-Overlay, Video fullscreen, Exit-Button). TabletQuickEntryPage: kombiniert Strafen/Getränke + Kamera-Wurf-Strip (Live-Würfe via SSE, Spieler-Zuordnung, Widerruf-Button) + Spieler-Reihenfolge (Abwechselnd / Block-Modus, aktuelle Spielerin hervorgehoben, nächste angezeigt, manuelle Weiter-Taste) + Spiel-Beenden (Gewinner-Wahl inline). game_throw_log.player_id (Migration 038, FK evening_player, SET NULL); DELETE /evening/{eid}/games/{gid}/throws/{tid}; Phase 4: game.active_player_id (Migration 041, FK evening_player SET NULL); PATCH /evening/{eid}/games/{gid}/active-player; Tablet schreibt aktiven Spieler bei Zug-Wechsel; Kiosk liest active_player_id + wählt Spiel automatisch. |
| 19 | **Bezahllink**                     | ✅      | PayPal.me-Link im Profil, Zahlung melden (PaymentRequest), Admin bestätigt/lehnt ab in Kasse        |
| 20 | **Abwesenheiten verwalten**        | ✅      | Spieltermine & RSVP (SchedulePage); Abwesenheitsstrafen auto beim Start-aus-Termin; no_cancel_fee nur wenn RSVP vorhanden; Gäste ohne regular_member_id werden beim Start automatisch als RegularMember angelegt |
| 21 | **Schulden-Erinnerungen**          | ✅      | APScheduler (tägl. 09:00); 5 Typen: Schulden wöchentlich, Kegeln in X Tagen (per-user), RSVP, Schulden am Kegeltag, Zahlungsanfragen-Nudge; Toggle-Fix; Broadcast-Push; Admin-Konfiguration in ClubAdminPage |
| 22 | **Import / Export**                | ✅      | Excel (.xlsx) + PDF-Export: Mitglieder-Konten, Buchungen, Strafen nach Person/Abend, Abend-Übersicht; Jahresfilter; auto. Bericht-Push vor Kegelabend (config in ClubAdmin); openpyxl + fpdf2 |
| 23 | **Pins**                           | ✅      | Vereinsnadeln: Träger zuweisen, Abend-Alert bei anwesendem Träger, Strafe per Knopfdruck eintrabar; PinsAlert zeigt ✓ wenn Strafe bereits eingetragen; Pin-Icons neben Kegelname; Präsident-Badge (🎯) ebenfalls inline |
| 24 | **iCal Export**                    | ✅      | Öffentlicher Abo-Link (webcal://) mit Secret-Token; Uhrzeit pro Termin; Club-Standard 20:00; 3 Migrationen (022–024); Soft-Delete von Terminen (STATUS:CANCELLED im Feed, Migration 029) |
| 25 | **Bug-Fixes Batch 1**              | ✅      | Statistiken-Label, leere Spiele-State, Teamzuordnung, Vergangenheitsdatum, Abend-Doppelstart, Quick-Start, Strafendatum (Admin), Ausgaben-Datum (Migration 028) |
| 26 | **Bug-Fixes Batch 2**              | ✅      | TreasuryPage Buchungen-Datum konsistent rechts (unter Betrag) für alle Eintragstypen; NotificationPanel markAllRead in useEffect (React-Renderbug); leere-Benachrichtigungen-Hinweis; Notification-Sync-Fix: beim Abend-Close wird ['evenings']-Liste sofort invalidiert + Offline-Queue geflusht, damit SchedulePage keine veraltete "aktiver Abend"-Karte zeigt und der OfflineBanner keine veralteten ausstehenden Änderungen anzeigt |
| 27 | **Highlights**                     | ✅      | Abend-Highlights erfassen (✨): evening_highlight-Tabelle, CRUD-Endpoints, Freitext-Input am Abend; Migration 030 |
| 28 | **Abend nur via Termin starten**   | ✅      | create_evening auf require_club_admin gesetzt; ad-hoc-Formular bleibt für Admins erhalten             |
| 29 | **Tablet Schnellerfassung**        | ✅      | Vollbild-Overlay (⚡) für Landscape-Modus; 3-Spalten-Layout: Spieler | Strafen | Getränke (separat); iOS safe-area-insets (Notch, Home-Indicator, gerundete Ecken); kein Scrollen erforderlich; letzte Einträge unten; 0€-Strafen ausgeblendet; Getränke-Spalte kompakt (Icon only), Strafen-Buttons vergrößert |
| 31 | **Navbar-Farben & Farbpalette**    | ✅      | Navbar nutzt CSS-Variablen (--kce-surface2, --kce-border, --kce-primary); Live-Vorschau bei Farbänderung; Paletten-Generator in Erscheinungsbild: Grundfarbe wählen + Vorschläge (Warm/Kontrast/Triade/Weich) oder Zufallspalette |
| 34 | **Kommentare & Reaktionen**        | ✅      | Instagram-Style Kommentar-Threads auf Highlights, Ankündigungen und Kegelfahrten; Autoren-Avatar (Bild oder Initialen), Chat-Bubble-Layout, relative Zeitangaben, ❤️ als primäre Reaktion rechts am Kommentar, weitere Emojis als Pill-Badges in der Aktionszeile; Pill-Input mit User-Avatar links; Bild vor Caption; 💬 (N) immer sichtbar inkl. (0); Antworten-Link inline; 🗑️ Löschen mit Inline-Bestätigung; bearbeiten (edited_at); max Tiefe 1 im UI (tiefere Nesting-Ebenen werden geflattened); Deeplink-Highlight beleuchtet Kommentar und Ursprungskachel; Migration 042+044; pytest: 28+ Tests; `comments`-Präferenz zum Deaktivieren von Kommentar/Reaktions-Benachrichtigungen |
| 35 | **Medien-Upload**                  | ✅      | Self-hosted Bild-Upload (JPEG/PNG/WebP/GIF, max 10 MB); POST /uploads/media; Bilder in Highlights, Ankündigungen und Kommentaren; MediaUploadButton-Komponente mit Vorschau; Migration 043 (media_url an highlight/announcement/comment + text nullable); pytest: 8 Tests |
| 36 | **Item-Reaktionen**                | ✅      | ❤️ als primäre Reaction-Schaltfläche auf Highlights, Ankündigungen und Kegelfahrten; weitere Emoji-Reaktionen als sekundäre Pill-Badges; ItemReactionBar-Komponente; VALID_PARENT_TYPES: highlight/announcement/trip; Migration 044 (item_reaction-Tabelle) |
| 37 | **Superadmin Club-Verwaltung**     | ✅      | Verein umbenennen (Name + Slug) via PATCH /superadmin/clubs/{id}; Verein löschen (Kaskaden-Delete aller Daten) via DELETE /superadmin/clubs/{id}; UI in SuperadminClubsTab (✏️-Button + ×-Button mit Bestätigungs-Sheet); pytest: 19 Tests |
| 38 | **Spieler-Performance-Tracking**   | ⬜      | Wurf-für-Wurf-Statistiken pro Mitglied über Zeit: Durchschnittswürfe, beste/schlechteste Abende, Trendkurve. Nutzt vorhandene game_throw_log-Daten (Feature 33). Neue Endpoints GET /stats/me/throws + GET /members/{id}/throws; persönliche Statistik-Karte im Profil + Detailansicht im Stats-Tab. |
| 39 | **Saisonabschluss-Workflow**       | ⬜      | Geführter Jahresabschluss für Admins: Kassenabschluss (alle offenen Salden auf Null setzen / Übertrag buchen), Jahresranking einfrieren (Snapshot-Tabelle), Archivierung aller Abende der Saison, PDF-Jahresbericht auto-generiert. Neuer Admin-Tab "Saisonabschluss" mit Step-Wizard. |
| 40 | **Gäste-Management**               | ⬜      | Gastspieler per Link einladen (zeitlich begrenztes Token); Gast sieht eigene Abend-Übersicht (Würfe, Strafen, Getränke) ohne vollen Account; Admin kann Gast nachträglich in reguläres Mitglied konvertieren. Neue Tabelle guest_token; GET /guest/{token}/summary Endpoint. |

## Testing TODO

The following functionality is **not yet covered** by automated tests and should be added in future iterations:

### Backend (pytest)

- **Reminders** — APScheduler job logic (debt, RSVP, schedule reminders) — requires time-travel mocking
- **Push broadcast triggers** — notification triggers for König, Abend start, new members, etc.

### Frontend (Vitest)

- **CameraCapturePage** — RAF/camera loop auto-submit (requires real MediaStream + canvas mocking), confirmation countdown timer (requires fake timers)

### Already covered

**Backend (pytest):** Games (create/start/finish/delete, loser-penalty, king flag, throw log CRUD, active-player) · Drinks · Stats (year/me) · Auth (login, register, reset, profile, avatar, locale, delete) · Push (subscribe/unsubscribe/status/test/preferences/debug/recent/mark-read/trigger-reminders) · Club routes (CRUD, logo upload) · Evenings (CRUD, players, penalties) · Schedule (CRUD, RSVP, iCal) · Treasury (balances, payments, expenses, PaymentRequest flow) · Committee (announcements, trips) · Superadmin (club CRUD, switch-club, listing) · Comments (list/create/edit/delete, reactions, item-reactions) · Uploads (media upload) · Reports (xlsx+pdf export) · Sync (add/delete penalty+drink) · Backups (CRUD with mocked pgbackrest)

**Frontend (Vitest):** cameraEngine (digit/pin/lamp) · turnOrder (alternating/block) · API client — all 80+ api.* methods (URL + HTTP method + body), authState, error classes, 401/NetworkError dispatch, uploadMedia, downloadReport, flushOfflineQueue (empty queue, single item, tempId remapping, server error discard, queue-changed/sync-flushed events) · Store/app.ts (isAdmin, role helpers) · i18n key parity (de↔en) · hexToHsl / hslToHex round-trip · offlineQueue (enqueue/getAll/remove/count/clear, isQueuableMutation) · Error handling (UnauthorizedError, NetworkError, OfflineQueuedError, authState) · Toast (showToast, ToastContainer render/display/timeout/multi/cleanup) · EmojiPickerButton (icon/insert mode, open/close, emoji selection) · CommentThread (Avatar with src/initials, toggle, controlled/uncontrolled, add/delete/react, comment rendering) · useActiveEvening (no-ID, real ID, temp/pending ID, invalidate, temp-id-resolved event, SSE setup) · useEveningList (query delegation) · StatsPage (annual ranking, year selector) · EveningPage (start form, active/closed states, player add/remove/edit, team add/edit/delete, close/reopen flow, highlights, attendance sheet) · TreasuryPage (overview/accounts/bookings tabs, payment recording, PaymentRequest confirm/reject) · SchedulePage (RSVP toggle, iCal copy, scheduled evening list) · HistoryPage (close/reopen evening, backlog sheet, expanded detail) · MembersPage (member CRUD, invite link, roster link, search, role/deactivate) · ProfileSheet (basic display, push preferences, balance display, payment form, logout) · TabletQuickEntryPage (rendering, player selection, penalty logging, drink logging, finish-game flow, throw strip, event deletion, start game) · CameraCapturePage (rendering, camera error, mode toggle, calibration save/reset, detection mode, test-throw submission, game finish, kiosk enter/exit) · GamesPage (game CRUD, start/finish flow, king flag) · CommitteePage (announcements, trips) · ClubAdminPage · LoginPage · ProtocolPage (penalty log)

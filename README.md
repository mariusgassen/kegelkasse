# 🎳 Kegelkasse — Kegelclub Manager

[![Backend Build](https://github.com/mariusgassen/kegelkasse/actions/workflows/backend-build.yml/badge.svg)](https://github.com/mariusgassen/kegelkasse/actions/workflows/backend-build.yml)
[![Frontend Build](https://github.com/mariusgassen/kegelkasse/actions/workflows/frontend-build.yml/badge.svg)](https://github.com/mariusgassen/kegelkasse/actions/workflows/frontend-build.yml)
[![Backend Tests](https://github.com/mariusgassen/kegelkasse/actions/workflows/backend-tests.yml/badge.svg)](https://github.com/mariusgassen/kegelkasse/actions/workflows/backend-tests.yml)
[![Frontend Tests](https://github.com/mariusgassen/kegelkasse/actions/workflows/frontend-tests.yml/badge.svg)](https://github.com/mariusgassen/kegelkasse/actions/workflows/frontend-tests.yml)
[![Backend Coverage](https://raw.githubusercontent.com/mariusgassen/kegelkasse/main/.github/badges/coverage-backend.svg)](https://github.com/mariusgassen/kegelkasse/actions/workflows/backend-tests.yml)
[![Frontend Coverage](https://raw.githubusercontent.com/mariusgassen/kegelkasse/main/.github/badges/coverage-frontend.svg)](https://github.com/mariusgassen/kegelkasse/actions/workflows/frontend-tests.yml)

Full-stack bowling club management PWA with offline sync, i18n (DE/EN), and role-based access.

## Stack

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| Backend    | FastAPI + PostgreSQL + Alembic               |
| Frontend   | React 18 + TypeScript + Vite + Tailwind      |
| PWA        | vite-plugin-pwa + Service Worker + IndexedDB |
| Auth       | JWT + bcrypt, invite-link registration       |
| i18n       | zustand-based translation system (de/en)     |
| Deployment | Docker Compose → Coolify                     |
| Docs       | Docusaurus (in `/docs`)                      |

## Documentation

Full user documentation (German) lives in the [`/docs`](./docs) directory, built with Docusaurus.

```bash
cd docs
npm install
npm start   # → http://localhost:3000
```

Topics covered:
- Getting started & registration
- Role guide: Member, Admin, Superadmin
- Features: Evenings, Games, Penalties, Drinks, Treasury, History, Statistics, Schedule & RSVP

## Quick start (development)

```bash
cp .env.example .env          # edit SECRET_KEY etc.
docker compose -f docker-compose.dev.yml up -d
docker compose exec app alembic upgrade head
docker compose exec app python -m app.scripts.create_admin
# Backend:  http://localhost:8000/api/docs
# Frontend: cd frontend && npm install && npm run dev  → :5173
```

## Production deploy (Coolify)

1. Push to Git repo
2. Coolify → New Resource → Docker Compose → repo URL
3. Set env vars (see `.env.example`)
4. Deploy — migrations + admin seed run automatically

### Database backups

Automatic backups run on a configurable cron schedule (default: daily at 02:00 UTC) via APScheduler inside the app container. Backups are stored in a Docker volume (`backup_data`) mounted at `/backups`.

Optional S3 upload to any S3-compatible storage (AWS S3, Hetzner Object Storage, MinIO, etc.) — configure via env vars:

```env
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETAIN_DAYS=7
S3_BUCKET=my-bucket
S3_ENDPOINT_URL=https://fsn1.your-objectstorage.com   # Hetzner example
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Superadmins can list, trigger, download, and delete backups in the app under **Verein → 💾 Backups**.

## Roles

| Role       | Access                                   |
|------------|------------------------------------------|
| superadmin | Everything + multi-club management       |
| admin      | Club settings, templates, invite members, member accounts |
| member     | Evenings, penalties, games, drinks, stats |

## Feature catalog

### Authentication & users

- Email/password login with JWT tokens (7-day expiry by default)
- Invite-link registration — admin generates a one-time token, user self-registers via link
- Per-user language preference (DE/EN), persisted server-side
- Admin can promote/demote members between `member` and `admin` roles
- **Profile sheet split into two tabs**: **🎳 Meine Saison** (default, read-only personal dashboard — balance & payment, yearly stats, throw performance, achievement badges, Kegel-Wrapped launcher) and **⚙️ Einstellungen** (avatar, display name, login email, password, language, push subscription + preferences, PWA install, docs links, logout, account deletion — the single scoped "Save" button lives only here)

### Club administration *(admin only)*

- Club settings: home venue, primary and secondary brand colors, PayPal.me handle, background color, no-show penalty
- **Regular members (Stammspieler)**: persistent roster with optional nickname; used to link evening players across sessions for stat tracking
- **Penalty types**: custom icon (emoji), name, default amount, sort order; soft-deleted when removed
- **Game templates**: name, description, winner type (`team` / `individual` / `either`), opener flag, president-game flag, default loser penalty, sort order; soft-deleted when removed
- **Teams**: reusable team presets that can be loaded when starting an evening
- **Pins (Vereinsnadeln)**: assign pin holders, evening-alert when a holder is present, one-click penalty entry; pin icons shown inline next to player names
- **Presidents**: annual Präsidentenspiel (🎯-flag), president history with tab view and history badge; 🎯 badge shown inline next to player name
- **Vergnügungsausschuss (VGA, Entertainment Committee)**: designate regular members as VGA-members (is_committee flag); committee members can post announcements (with push notification to all) and manage Kegelfahrten (bowling trips); dedicated 🚌 tab for all members; VGA management in the admin Verein tab

### Evening management

- Evenings are started from a scheduled entry (SchedulePage); no more ad-hoc creation
- Create evenings with date, optional venue override, and a free-text note
- Open/close toggle — closing an evening archives it to history; closing lets you set the evening's end timestamp (prefilled with the previously saved value, or now), so you can backdate it if you forgot to close on time — the value is kept across reopen/re-close unless explicitly changed
- Add players ad-hoc or from the regular-member roster (linking them for stats)
- **Highlights**: record memorable moments (Schuh geworfen, Kugel gegen die Heizung…) as free-text highlights on the evening
- Create named teams and assign players to them; reassign or dissolve teams at any time
- 30-second live polling so all connected users see changes without refresh

### Penalties

- Apply a penalty to one or more individual players in a single action
- Apply a team penalty — automatically fans out to every player on the team
- Penalty amount and mode (`euro` / `count`) are independently editable after creation
- Edit sheet with Quick/Custom tabs: custom (free-text) penalties keep their icon and name editable; admin date override uses local time
- Soft-delete (undo) without data loss
- Spin wheel for random penalty-type selection
- Absence penalties for missing regular members; timestamped with the evening's end time (`ended_at`), not the moment the penalty was calculated

### Games

- Record game results from a template or as a free-form entry
- Winner can be a player (`p:<id>`) or a team (`t:<id>`)
- Optional pin scores per player/team stored as a JSON map
- Opener flag highlights the crown game (König) in the UI
- Configurable loser penalty: when set, penalty log entries are auto-created for every non-winner player when the game is finished
- Once a winner is picked in the finish dialog, a **loser penalty preview** shows the exact amount each loser will be charged — always, regardless of whether the game template has a per-point add-on or just a flat loser penalty. Available both in the regular Games view and in the tablet quick-entry finish panel
- Editing a finished game recalculates its loser penalties (old entries removed, new ones created); the recalculated entries keep the game's original `finished_at` timestamp, not the edit time
- Soft-delete (undo) without data loss
- Admins can retroactively add or correct a game's start/end time (e.g. if starting/finishing was forgotten during the evening) via a dedicated time-edit sheet; correcting a finished game's end time also retimes its existing loser penalties to the new timestamp (in place, without recreating them)
- No game — individual or team — can be started (nor auto-started right after creation from a template) until the evening has teams set up and every player is assigned to one; both the Games tab and the tablet quick-entry panel block the action and show a toast instead. Teams are configured once per evening, before any games are played, so this applies regardless of the specific game's winner type

### Drinks

- Log beer or shot rounds with an optional variety label
- Track which players participated in each round
- In the tablet quick-entry panel, log a round straight from the penalty grid (🍺/🥃 buttons reuse the same player multi-selection as penalties)
- Soft-delete (undo) without data loss

### Schedule & RSVP

- Plan future bowling evenings with date, time, venue, and optional notes
- Members set their RSVP status (attending / absent / no response)
- Admins send push reminders to non-responders
- Add known guests to planned evenings
- Start a real evening directly from a scheduled entry, optionally importing all attending members as players
- Absence penalties auto-calculated on evening start for members with explicit RSVP cancellation
- **iCal export**: subscribe to all planned evenings in Apple Calendar, Google Calendar, or Outlook via a secret per-club token (webcal://); configurable default time

### Treasury & accounts

- Per-evening ranking by penalty amount with drinks overview
- Text export (Share/Copy) for WhatsApp & notes
- **Balance-history graph**: interactive SVG chart on the Overview tab showing the running balance over time as a step line; toggle between **Kasse** (overall club cash) and **Mitglied** (any individual member's personal balance, with an "Ich"-badged member picker); **Month / Year / All** views with continuous cumulative paging (never resets to zero), a y-axis with € labels on every view (previously only on "All"), and a horizontally scrollable "All" timeline with a fixed y-axis; **every** view (Month, Year **and All**) now clusters points onto discrete evenly-spaced buckets — one per active calendar day ("evening") in Month/All view, one per calendar month in Year view — instead of continuous-time spacing, so a handful of bookings in an otherwise quiet period aren't squeezed into one corner and same-timestamp bursts (e.g. a season close) no longer pile onto a single "bucket" in the All view; two parallel lines in **Kasse** scope ("Tatsächlich" real bookings vs. "Inkl. Schulden" incl. outstanding debt) and **three** in **Mitglied** scope — "Eingezahlt" (payments made), "Strafen" (cumulative penalties incurred) and "Saldo" (balance = paid − penalties, emphasized), so the gap between the paid and penalty lines is the running balance; for **guests** the penalty and balance lines honor the **per-evening guest penalty cap** (a guest's fines within one evening never exceed the cap, and guest absence penalties are excluded), so the line matches the canonical guest balance instead of the raw penalty sum; clicking a point reveals the underlying booking/penalty (date, kind, amount, and — in Mitglied scope — all three running values). **Player-labeled debt points**: in Kasse scope the club-wide "Inkl. Schulden" overlay points are now attributed to the member whose outstanding balance moved (the backend `treasury-debt-timeline` returns a `member_name` per checkpoint), so the aggregate debt line can be traced to individual players on click. **Clustered markers**: points sharing the same x-axis bucket (and drawn on the same actual/overlay curve) collapse into a single clickable marker (with a "×N" badge) instead of stacked, mutually-hiding circles where only the last-drawn one could be clicked — clicking a cluster lists every underlying booking/penalty in the details view. Pure `clusterPoints()` in `lib/balanceHistory.ts`, tested.
- Member accounts: track balances and record payments (admin)
- Club expenses (e.g. lane rental) tracked separately
- **Accounts tab totals & per-player share chart**: two stat tiles at the top of the Konten tab show **Offen gesamt** (total outstanding debt) and **Bezahlt gesamt** (total paid in) across all member accounts; a note clarifies that any credit included in the paid-total is money the till owes back to members (auto-offset against future penalties, or paid out on removal), not free club cash; a collapsible **📊 Anteil pro Spieler** chart below shows each member's penalties split into paid (green) and open (red) portions as a horizontal bar, scaled to the member with the highest total penalties
- **Edit bookings**: admins can edit any booking (member payment or club expense) after the fact — direction, amount, note/description, and date via a ✏️ edit sheet on booking rows (Kassenbuch tab and account payment history); the date can also be backdated when creating a new booking (member payment or club expense) via the "add booking" sheet; edited bookings carry an ✏️ marker (audit columns `updated_at`/`updated_by`), and the affected member gets a push notification when a payment amount changes
- **Settled-members detail**: the "+ N settled" summary line below the debtors/credits lists is now a collapsible toggle (previously static text with no way to see who it referred to) — expanding it shows a pill list of the exactly-settled members (own account first, "Ich" badge), matching the visibility already available per-member in the Konten tab
- **Tangible overview**: the treasury Overview leads with a personal **Mein Konto** card (own open amount / credit / settled state, penalties-vs-paid breakdown, paid-share progress bar, PayPal pay & report actions); the **Kassenstand** hero shows an explicit money-flow breakdown (paid-in by members+guests, expenses, outstanding debt, projected cash if everyone pays) — **expenses and other income are split into two rows** (gross expenses vs. income booked via the club-expenses ledger, e.g. sponsoring) instead of one netted "net expenses" figure whose sign flip was confusing; each hero row is **clickable to expand its underlying bookings** (who paid what, which expense entries make up the total, who's still in debt) without leaving the Übersicht tab; every debtor/account row visualizes its paid share of penalties as a thin progress bar. A small, low-key **"Wie funktioniert die Kasse?"** toggle tucked into the bottom of the hero (rather than its own standalone card) describes the penalties → payments → cash model on demand.
- **Filter balance by players (🔍 Nach Spielern filtern)**: a collapsible member picker right below the personal "Mein Konto" card — and above the Kassenstand hero — on the Overview tab scopes the page **globally** to a selection of members, positioned so the control precedes everything it affects rather than following it. A count badge next to the title shows how many members are selected (visible even when collapsed) and a **Reset** button clears the selection. Once members are picked, a **Show only selected** toggle restricts every figure/list to just that subset; otherwise the filter simulates the selection *leaving the club* via three independent options — **Write off open penalties** (default on) drops their outstanding debt (already-paid stays), **Deduct already-paid** refunds their paid-in money and removes it from the cash on hand, and **Settle their share** applies each member's equal 1/n slice of (other income − gross expenses) as a payout shown on its own "Selection's share" flow row. The filter drives the Kassenstand hero and its money-flow breakdown rows (paid-in/outstanding/cash-on-hand/projected), the "Offen & Guthaben" tiles/lists, and — in 🏛️ Kasse scope — the "Tatsächlich" (actual cash) line of the 📈 Verlauf history graph; club-wide expenses and the debt-timeline overlay (not attributable to individual members) stay unfiltered, guests are never part of the selectable filter, and the Konten tab remains the whole-club view. Pure logic in `lib/treasurySummary.ts` (`writeOffOutstandingDebt`, `refundPaidIn`, `shareSettlement`)
- **Booking audit trail**: deleting a payment or expense is a soft-delete (`is_deleted`, `deleted_at`, `deleted_by`, optional free-text reason) rather than a hard delete — nothing vanishes without a trace; the affected member gets a push notification when one of their payments is removed; duplicate submissions (double-tap, retried request) are prevented via a client-generated idempotency key on payment/expense creation
- **Bezahllink**: members request payment via PayPal.me link; admin confirms manually
- **Report export**: admins download a full treasury report as Excel (.xlsx) or PDF — 6 sections: summary, member accounts, all transactions, penalties by member, penalties by evening, evenings overview; optional year filter (dropdown lists only years that actually have bookings, derived from payments/expenses); automated push notification to admins before the next bowling evening (configurable in club settings); the year/format controls live behind a "📊 Export" button next to the page header, opening a dedicated sheet, instead of an always-visible row above the tabs
- **Saisonabschluss (Season closing)**: guided year-end wizard for admins — balance carry-over (books a zeroing payment for every member with a non-zero balance), annual ranking snapshot (frozen JSON record in `season_snapshot` table), bulk-archive all open evenings, one-click PDF annual report download; past season closings listed with PDF re-download
- **Pass on guest costs**: admins can transfer an outstanding guest balance to a regular member with one tap (↪️ Übertragen) — creates a paired booking (credit on the guest, matching debit on the member) while leaving the statistics / PenaltyLog untouched
- **Entry fee on guest promotion**: when an admin promotes a guest to a regular member (⬆️ Zu Mitglied machen), a confirmation sheet suggests a pro-rata entry fee — the club's treasury balance (incl. open debts, summed across existing members) divided by the number of existing members. Admin can adjust or clear it; on confirm it's logged as a debt (negative `MemberPayment`) on the new member's account
- **Guests are never deletable**: known guests permanently remain part of the club history (their evening participation and stats persist), so the roster shows no delete action for them and the API rejects guest deletion (400). Removing a regular member instead degrades them to guest status — a reversible, non-destructive change, reflected by a subtle (⬇️, secondary-styled) button rather than a destructive ✕

### Statistics

- "Abend" / "Jahr" tab split — per-evening analysis and the yearly rollup live behind two tabs instead of one long scroll
- Yearly rollup by regular member: evenings attended, total penalty amount (€), penalty count, game wins, beer rounds, shot rounds
- Personal stats in user profile
- Year selector with CSS bar chart visualization
- Per-evening analysis: donut chart with penalty distribution, hall of fame, cumulative timeline chart (tap a penalty dot to see the source penalty), and a **Games & Results** drawer listing every game with status, winner, scores, and throw summary
- **🏅 Achievements & badges**: each member automatically collects 12 career badges in their profile, derived purely from existing evening/game/penalty/drink data — tiered bronze/silver/gold (Stammgast, König, Seriensieger, Bierkönig, …) plus one-off badges (All Nine, President, Clean Sheet); earned badges light up in their tier colour, locked ones show a progress bar to the next tier
- **🎁 Kegel-Wrapped (year in review)**: a tappable "Spotify-Wrapped"-style card story in the profile with the member's personal season highlights — attendance, total & priciest penalty, favourite penalty, times king, game wins, drink rounds, throw average, penalty rank, and a tongue-in-cheek "bowler type" finale (Sinner of the Year, Beer Baron, The Saint, …); data-less cards are skipped automatically
- **Penalties × Drinks correlation**: three-tab analysis in the year view — per-evening scatter (€ vs drink rounds with trend line, Pearson *r*, plain-language slope, top-vs-bottom quartile means, season cumulative dual-axis line and a top-5-vs-quietest-5 streak callout once N ≥ 10), per-(member × evening) scatter (one dot per member & evening, colour = member, focusable via pill legend with personal trend line + *r*), and correlation-strength ranking per member. The evening-detail section adds a within-evening **timeline panel** with a member pill picker (including an "All" pill that overlays every member's cumulative € and drink curves for direct comparison) and a bin-size picker (5/15/30 min); tapping a member focuses on them with a dual-axis cumulative chart, a per-bin Δ-bar chart, the Pearson *r* of the per-bin changes, and a **penalty-per-drink badge** (€ penalty divided by drinks, e.g. "3.20 € per drink") comparing this player to the evening average in plain ±% language — under-average = green (cheaper rounds), above-average = amber (each drink costs more)

### Push & email notifications & reminders

- **Per-category delivery channels: push and/or email** — every notification (including the automated reminders) can be delivered as Web Push, as an email, as **both at once**, or turned off; push and email are independent toggles per member, per category, in the profile settings tab
- Web Push via VAPID — works on Android Chrome, Safari, and desktop browsers
- **Per-club email server (SMTP)**: admins configure host/port/credentials/from-address/TLS in the club settings (stored per club, password encrypted at rest via Fernet), with a "send test email" button; the email channel is only offered to members once their club has email enabled
- **Club-themed, localized emails**: every notification email is rendered with the club's brand color (header band, buttons, accents), in the recipient's own language (de/en), with the club logo (or an initial) shown as a circular avatar next to the club name — the closest equivalent to a "sender avatar" achievable from message content (a real inbox-level sender avatar needs Gravatar/BIMI, outside the app's control)
- **Personalized email digest**: each member opts into a digest cadence (off / daily / weekly / monthly) in their profile; a scheduled job (daily at 08:00) sends a themed, deep-linked summary of everything since their last digest — new/updated bowling evenings, their own penalties and bookings, community news — plus a personal account & balance overview and an "open in the app" button. Community news is grouped into **threads**: one row per announcement/trip/highlight with new activity (title, type icon, comment+reaction counts), deep-linked to the newest activity in that thread, instead of one row per individual comment/reaction. Empty digests are skipped; a "send digest now" button previews it on demand
- Notifications sent for: penalty added, absence penalty, game loser penalty, evening closed, payment confirmed/rejected, schedule reminders
- Members subscribe/unsubscribe push per device from their profile
- Announcements are always delivered (push) and cannot be disabled
- Falls back silently to the in-app bell when neither VAPID nor a club email server is configured
- **Automated reminders** (scheduled daily at 09:00 via APScheduler):
  - Weekly debt reminder — push to members with outstanding balance above a configurable threshold (configurable weekday)
  - Upcoming evening — push N days before each scheduled event; each user sets their own preferred lead time (default from club settings)
  - RSVP reminder — push to members who haven't responded N days before an event
  - Bowling-day debt reminder — push to debtors on the day of a scheduled evening
  - Pending payment request nudge — push to admins when requests stay unresolved past N days
- Admins enable/disable and configure each reminder type in the club settings (Einstellungen-Tab)
- Users choose push and/or email (independent toggles) per reminder category in their profile
- **Broadcast push**: admins can send a custom push to all club members from the settings page

### PWA & offline

- Service worker caches API responses and static assets
- IndexedDB for local data; delta sync endpoint reconciles offline changes
- Offline banner visible when network is unavailable
- Installable on mobile home screen
- Auto install-suggestion banner (native prompt on Chromium; iOS "Add to Home Screen" how-to sheet); also available in Profile
- Update-available banner — a new service-worker version waits for explicit confirmation ("Aktualisieren") instead of silently reloading the app mid-evening
- Manifest orientation set to `any` (not locked to portrait) so the landscape kiosk pages (Tablet Schnellerfassung, Kamera-Wurf-Erkennung) aren't fought by the OS

### UI / UX

- Read-only member roster tab for regular (non-admin) members — admins manage the roster via the Verein tab instead
- "⚙️ Verwalten" is a fourth sub-tab in the evening hub (alongside Protokoll/Spiele/Highlights) surfacing team/player management and closing the evening without leaving the hub's tab strip
- Dark/Light/System appearance toggle (Profile → Settings) — light mode is derived from the same per-club brand color (hue/saturation preserved, only lightness flips), so it also works for clubs with a custom background color; "System" follows the OS `prefers-color-scheme` live, without a reload
- Global search (🔍 header icon or Cmd/Ctrl+K) — jumps straight to a member, their treasury account, a past evening, a payment/expense booking, an announcement, or a Kegelfahrt via the same deep-link hashes push notifications already use; each result group has an icon, dates are shown in localized long form, and the query also matches written-out month names in the active language (e.g. "March"/"März")
- Toast notifications for every create/update/delete action
- AdminGuard component — wraps any section to show a lock icon to non-admins
- Mobile-optimised layout with tab navigation and bottom sheet drawers
- German and English translations, user-selectable
- Accessibility: WCAG-AA muted-text contrast, keyboard-operable chart points/segments (StatsPage, TreasuryPage), focus-managed bottom sheets (focus moves in on open, restores to the trigger on close), larger touch targets and `aria-label`s on icon-only buttons (sheet close, throw edit/void, camera close)
- Responsiveness: Tablet Schnellerfassung's three-column layout stacks (penalty/drink actions first) on narrower or portrait tablets instead of breaking down
- Evening hub sub-tab strip scrolls horizontally instead of truncating labels — same tab pattern used across the rest of the app
- Member rows (app users, roster, guests) are tap-to-open instead of stacking multiple icon-only buttons — tapping a row opens an action sheet listing every available action with an icon and text label

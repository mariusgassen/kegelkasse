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

### Start dashboard ("Für dich")

- **Personalized landing page** (🏠) shown by default when no evening is running (the router's index redirect picks it over the evening page; an active evening opens straight into the evening instead). Reachable any time via the **Start** nav tab.
- Composes existing endpoints (schedule, my-balance, committee, stats/me, member-penalties) — no new backend/migration. Sections: personal greeting, an active-evening callout (when one is running), the **next appointment with a state-aware RSVP** (prompts once, then shows your current status and offers only the single opposite action — no confusing two-button layout), a **my-account glance** (balance state + jump to the treasury account), **latest community news** (announcements + trips, deep-linked to the item), a **personal season metric** (throw average + trend sparkline), and **my latest penalties** — **grouped by evening**: each evening shows its date, the **total** of all penalties that night, a few of the individual entries, and an **"and N more"** summary line for the rest (deep-linked to the account).
- The dashboard deliberately drops the duplicate quick-action navigation tiles — the persistent bottom nav (side rail on desktop) already covers those destinations.
- Sections without data (no linked member → no account/penalties card; no news / no throws / no penalties → those cards hidden) are omitted. Pure derivation in `lib/dashboard.ts` (`nextAppointment`, `recentCommunity`, `balanceState`, `recentThrowAvgs`, `recentPenaltyEvenings`), unit-tested.

### Authentication & users

- Email/password login with JWT tokens (7-day expiry by default)
- Invite-link registration — admin generates a one-time token, user self-registers via link
- **Self-service password reset**: a "Passwort vergessen?" link on the login page emails a one-time, one-hour reset link via the club's own SMTP server (no admin needed). The response is always generic (no account/email enumeration), rate-limited per email/IP, and only sends when the address matches an active account whose club has email configured — admins can still create a reset link manually otherwise
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
- **Vergnügungsausschuss (VGA, Entertainment Committee)**: designate regular members as VGA-members (is_committee flag); committee members can post announcements (with push notification to all) and manage Kegelfahrten (bowling trips); dedicated 🚌 tab for all members; VGA management in the admin Verein tab. Post actions (edit/delete, close/reopen a poll) live behind a **⋮ action menu** on each card — a neutral kebab instead of a tempting bare "×" that reads like a harmless dismiss — with the actual delete labelled + red and still gated by a confirmation sheet. The kebab → action-sheet pattern is a shared `ActionSheet` component (`ActionItem`/`MoreButton`/`CardActionMenu`), also used by the members roster

### Evening management

- **Live mode (🔴)**: while an evening is running the app opens straight into an immersive live cockpit — the first sub-tab of the evening hub. A **scoreboard** (running game, whose turn it is, next player, last throw), a **stat row** (evening penalty total, beer/shot rounds, games finished), thumb-sized **quick actions** (Fine/Round → quick entry, Highlight → highlights tab, Games → games tab), and a chronological **event ticker** (penalties, drink rounds and highlights, newest first). Read-only over the active evening, kept fresh by the existing SSE + polling; the live tab disappears once the evening is closed. Pure derivation in `lib/liveEvening.ts` (`currentGameState`, `buildEventFeed`, `eveningTotals`), unit-tested.
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
- **🎉 Celebration effects**: a confetti burst + short chime fires when a König is crowned or someone throws Alle Neune (9 pins), across every entry point — the Games tab, tablet quick-entry, and the camera kiosk. Respects `prefers-reduced-motion` (confetti is skipped, the chime still plays) and can be turned off entirely via a personal toggle in the profile settings
- **Camera throw tracking is opt-in per club**: the real-time camera pin/throw detection (feature #33) can be switched off under **Verein → Einstellungen → Wurf-Erfassung** (`throw_tracking_enabled` in club settings, default on). When disabled, every throw surface is hidden — the 📷 camera button, the tablet live-throw strip, the live-view last-throw readout, throw-performance cards (profile, year ranking), the dashboard throw metric, per-game/-year throw stats, the Kegel-Wrapped throw card, and the Hall of Shame "weakest throw" award — while penalties, drinks, games and winner selection stay fully usable. Intended for clubs whose bowling machine can't feed throw data

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
- **Balance-history graph**: interactive SVG chart on the Analyse tab showing the running balance over time as a step line; toggle between **Kasse** (overall club cash) and **Mitglied** (any individual member's personal balance, with an "Ich"-badged member picker); **Month / Year / All** views with continuous cumulative paging (never resets to zero), a y-axis with € labels on every view (previously only on "All"), and a horizontally scrollable "All" timeline with a fixed y-axis; **every** view (Month, Year **and All**) now clusters points onto discrete evenly-spaced buckets — one per active calendar day ("evening") in Month/All view, one per calendar month in Year view — instead of continuous-time spacing, so a handful of bookings in an otherwise quiet period aren't squeezed into one corner and same-timestamp bursts (e.g. a season close) no longer pile onto a single "bucket" in the All view; two parallel lines in **Kasse** scope ("Tatsächlich" real bookings vs. "Inkl. Schulden" incl. outstanding debt) and **three** in **Mitglied** scope — "Eingezahlt" (payments made), "Strafen" (cumulative penalties incurred) and "Saldo" (balance = paid − penalties, emphasized), so the gap between the paid and penalty lines is the running balance; for **guests** the penalty and balance lines honor the **per-evening guest penalty cap** (a guest's fines within one evening never exceed the cap, and guest absence penalties are excluded), so the line matches the canonical guest balance instead of the raw penalty sum; clicking a point reveals the underlying booking/penalty (date, kind, amount, and — in Mitglied scope — all three running values). **Player-labeled debt points**: in Kasse scope the club-wide "Inkl. Schulden" overlay points are now attributed to the member whose outstanding balance moved (the backend `treasury-debt-timeline` returns a `member_name` per checkpoint), so the aggregate debt line can be traced to individual players on click. **Clustered markers**: points sharing the same x-axis bucket (and drawn on the same actual/overlay curve) collapse into a single clickable marker (with a "×N" badge) instead of stacked, mutually-hiding circles where only the last-drawn one could be clicked — clicking a cluster lists every underlying booking/penalty in the details view. Pure `clusterPoints()` in `lib/balanceHistory.ts`, tested.
- Member accounts: track balances and record payments (admin)
- Club expenses (e.g. lane rental) tracked separately
- **Accounts tab totals & per-player share chart**: two stat tiles at the top of the Konten tab show **Offen gesamt** (total outstanding debt) and **Bezahlt gesamt** (total paid in) across all member accounts; a note clarifies that any credit included in the paid-total is money the till owes back to members (auto-offset against future penalties, or paid out on removal), not free club cash; a collapsible **📊 Anteil pro Spieler** chart below shows each member's penalties split into paid (green) and open (red) portions as a horizontal bar, scaled to the member with the highest total penalties
- **Edit bookings**: admins can edit any booking (member payment or club expense) after the fact — direction, amount, note/description, and date via a ✏️ edit sheet on booking rows (Kassenbuch tab and account payment history); the date can also be backdated when creating a new booking (member payment or club expense) via the "add booking" sheet; edited bookings carry an ✏️ marker (audit columns `updated_at`/`updated_by`), and the affected member gets a push notification when a payment amount changes
- **Settled-members detail**: the "+ N settled" summary line below the debtors/credits lists is now a collapsible toggle (previously static text with no way to see who it referred to) — expanding it shows a pill list of the exactly-settled members (own account first, "Ich" badge), matching the visibility already available per-member in the Konten tab
- **Glance vs. analysis (two levels)**: the treasury **Übersicht** is the glance level — one card per core question (**Mein Konto**: own open amount / credit / settled state, penalties-vs-paid breakdown, paid-share progress bar, PayPal pay & report actions; **Was ist in der Kasse?**: the Kassenstand hero stating the money flow — paid-in by members+guests, gross expenses, other income booked via the club-expenses ledger, outstanding debt, projected cash if everyone pays; **Wer schuldet noch?**: the open/credit tiles heading the debtor, credit, settled and guest lists, each row visualizing its paid share of penalties as a thin progress bar). The Übersicht always shows the club's real, unfiltered figures. Everything that interprets those numbers moved into a dedicated **🔬 Analyse** tab, reached from the hero's "see the money flow in detail" link: the player filter with its leaving-member simulation, the itemized per-row booking breakdowns, and the balance-history graph. A small, low-key **"Wie funktioniert die Kasse?"** toggle tucked into the bottom of the hero describes the penalties → payments → cash model on demand.
- **Analyse tab (🔬)**: the drill-in level of the treasury, deliberately entered rather than scrolled past. It holds the **🔍 Nach Spielern filtern** member picker (expanded by default — no collapse to tap through), a count badge and a **Reset** button. A **Show only selected** toggle restricts the figures to that subset; otherwise the filter simulates the selection *leaving the club* via three independent options — **Write off open penalties** (default on) drops their outstanding debt (already-paid stays), **Deduct already-paid** refunds their paid-in money and removes it from the cash on hand, and **Settle their share** applies each member's equal 1/n slice of (other income − gross expenses) as a payout shown on its own "Selection's share" flow row. Below it, the same money flow as the Übersicht — but with **every row expandable into the bookings behind it** (who paid what, which expense entries make up the total, who's still in debt) — and the 📈 Verlauf history graph. The filter scopes the Analyse tab **only**: Übersicht, Konten and Kassenbuch always show the whole club, so an admin power tool can never silently rescope what members read. Club-wide expenses and the debt-timeline overlay (not attributable to individual members) stay unfiltered and guests are never part of the selectable filter. Pure logic in `lib/treasurySummary.ts` (`writeOffOutstandingDebt`, `refundPaidIn`, `shareSettlement`)
- **Booking audit trail**: deleting a payment or expense is a soft-delete (`is_deleted`, `deleted_at`, `deleted_by`, optional free-text reason) rather than a hard delete — nothing vanishes without a trace; the affected member gets a push notification when one of their payments is removed; duplicate submissions (double-tap, retried request) are prevented via a client-generated idempotency key on payment/expense creation
- **Bezahllink**: members request payment via PayPal.me link; admin confirms manually
- **Report export**: admins download a full treasury report as Excel (.xlsx) or PDF — 6 sections: summary, member accounts, all transactions, penalties by member, penalties by evening, evenings overview; optional year filter (dropdown lists only years that actually have bookings, derived from payments/expenses); automated push notification to admins before the next bowling evening (configurable in club settings); the year/format controls live behind a "📊 Export" button next to the page header, opening a dedicated sheet, instead of an always-visible row above the tabs
- **Saisonabschluss (Season closing)**: guided year-end wizard for admins — balance carry-over (books a zeroing payment for every member with a non-zero balance), annual ranking snapshot (frozen JSON record in `season_snapshot` table), bulk-archive all open evenings, one-click PDF annual report download; past season closings listed with PDF re-download
- **Pass on guest costs**: admins can transfer an outstanding guest balance to a regular member with one tap (↪️ Übertragen) — creates a paired booking (credit on the guest, matching debit on the member) while leaving the statistics / PenaltyLog untouched
- **Entry fee on guest promotion**: when an admin promotes a guest to a regular member (⬆️ Zu Mitglied machen), a confirmation sheet suggests a pro-rata entry fee — the club's treasury balance (incl. open debts, summed across existing members) divided by the number of existing members. Admin can adjust or clear it; on confirm it's logged as a debt (negative `MemberPayment`) on the new member's account
- **Guests are never deletable**: known guests permanently remain part of the club history (their evening participation and stats persist), so the roster shows no delete action for them and the API rejects guest deletion (400). Removing a regular member instead degrades them to guest status — a reversible, non-destructive change, reflected by a subtle (⬇️, secondary-styled) button rather than a destructive ✕

### Statistics

- "Abend" / "Jahr" / "📊 Labor" tab split — per-evening analysis and the yearly rollup stay glance-level, while every deep analysis lives behind a deliberately entered lab tab instead of padding both other tabs
- Yearly rollup by regular member: evenings attended, total penalty amount (€), penalty count, game wins, beer rounds, shot rounds
- Personal stats in user profile
- Year selector with CSS bar chart visualization
- Per-evening analysis: donut chart with penalty distribution, hall of fame, cumulative timeline chart (tap a penalty dot to see the source penalty), and a **Games & Results** drawer listing every game with status, winner, scores, and throw summary
- **🏅 Achievements & badges**: each member automatically collects 12 career badges in their profile, derived purely from existing evening/game/penalty/drink data — tiered bronze/silver/gold (Stammgast, König, Seriensieger, Bierkönig, …) plus one-off badges (All Nine, President, Clean Sheet); earned badges light up in their tier colour, locked ones show a progress bar to the next tier
- **🎁 Kegel-Wrapped (year in review)**: a tappable "Spotify-Wrapped"-style card story in the profile with the member's personal season highlights — attendance, total & priciest penalty, favourite penalty, times king, game wins, drink rounds, throw average, penalty rank, and a tongue-in-cheek "bowler type" finale (Sinner of the Year, Beer Baron, The Saint, …); data-less cards are skipped automatically
- **📊 Statistik-Labor**: the opt-in analysis destination — **🏅 club records** (all-time: most expensive evening, priciest evening for one player, largest single penalty, longest attendance streak, most king titles, most game wins, thirstiest evening, best throw average; a record with no data yet is omitted rather than shown with an empty holder, and throw records disappear when the club has throw tracking off), **⚔️ head-to-head** (tap two members to compare evenings, penalties, penalty-per-evening, wins, win rate, drink rounds and throw average side by side for the selected season), **📊 season comparison** (one row per season with penalties, evenings, players and drinks, computed from evenings so open seasons appear too, with closed seasons marked from their season snapshot), plus both correlation panels below
- **Penalties × Drinks correlation** *(in the 📊 Labor tab)*: three-tab analysis — per-evening scatter (€ vs drink rounds with trend line, Pearson *r*, plain-language slope, top-vs-bottom quartile means, season cumulative dual-axis line and a top-5-vs-quietest-5 streak callout once N ≥ 10), per-(member × evening) scatter (one dot per member & evening, colour = member, focusable via pill legend with personal trend line + *r*), and correlation-strength ranking per member. The evening-detail section adds a within-evening **timeline panel** with a member pill picker (including an "All" pill that overlays every member's cumulative € and drink curves for direct comparison) and a bin-size picker (5/15/30 min); tapping a member focuses on them with a dual-axis cumulative chart, a per-bin Δ-bar chart, the Pearson *r* of the per-bin changes, and a **penalty-per-drink badge** (€ penalty divided by drinks, e.g. "3.20 € per drink") comparing this player to the evening average in plain ±% language — under-average = green (cheaper rounds), above-average = amber (each drink costs more)
- **🙈 Hall of Shame**: a club-wide "worst of the season" card in the year view, next to the podium — highest penalty-€-per-evening, thirstiest bowler (most drink rounds), weakest throw average, and most evenings played without a single win; each award is skipped if nobody has enough of a sample size to qualify

### Push & email notifications & reminders

- **Per-category delivery channels: push and/or email** — every notification (including the automated reminders) can be delivered as Web Push, as an email, as **both at once**, or turned off; push and email are independent toggles per member, per category, in the profile settings tab
- Web Push via VAPID — works on Android Chrome, Safari, and desktop browsers
- **Per-club email server (SMTP)**: admins configure host/port/credentials/from-address/TLS in the club settings (stored per club, password encrypted at rest via Fernet), with a "send test email" button; the email channel is only offered to members once their club has email enabled. An optional **custom domain** field overrides the server-wide `APP_BASE_URL` for that club's email links — e.g. a club running the app behind its own CNAME'd domain gets links pointing at its own domain instead of the shared default
- **Club-themed, localized emails**: every notification email is rendered with the club's brand color (header band, buttons, accents), in the recipient's own language (de/en), with the club logo (or an initial) shown as a circular avatar next to the club name — the closest equivalent to a "sender avatar" achievable from message content (a real inbox-level sender avatar needs Gravatar/BIMI, outside the app's control)
- **Personalized email digest**: each member opts into a digest cadence (off / daily / weekly / monthly) in their profile; a scheduled job (daily at 08:00) sends a themed, deep-linked summary of everything since their last digest — new/updated bowling evenings, their own penalties and bookings, community news — plus a personal account & balance overview and an "open in the app" button. Community news is grouped into **threads**: one row per announcement/trip/highlight with new activity (title, type icon, comment+reaction counts, plus a short **text preview** of the newest comment so members can read it without opening the app), deep-linked to the newest activity in that thread, instead of one row per individual comment/reaction. Empty digests are skipped; a "send digest now" button previews it on demand
- **Installed-app link capturing**: the PWA manifest declares `capture_links`, so on browsers that support it (Chrome/Edge on desktop & Android) a deep link tapped in an email opens in the already-installed app window instead of a new browser tab, when installed; no effect on iOS/Safari (not supported by WebKit)
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

- **Reworked navigation — 4 primary tabs + a Verein hub**: the bottom bar / side rail is trimmed to **Start · Kasse · Termine · Verein** for every role (plus the contextual **Abend** tab while an evening runs), down from six-plus permanent tabs. The low-frequency club/people/analytics pages — **Neuigkeiten, Mitglieder, Stats** and (admins only) **Verwaltung** — are grouped behind the **Verein** hub: tapping it lands on Neuigkeiten and a secondary section strip (rendered under the header while on any group page) switches between them. Both roles now see the same primary tabs; the old members-vs-Verein role split moved into the hub (members get Mitglieder read-only, admins get Verwaltung). The grouped pages stay real routes, so every deep link and push URL is unchanged
- "⚙️ Verwalten" is a fourth sub-tab in the evening hub (alongside Protokoll/Spiele/Highlights) surfacing team/player management and closing the evening without leaving the hub's tab strip
- Dark/Light/System appearance toggle (Profile → Settings) — light mode is derived from the same per-club brand color (hue/saturation preserved, only lightness flips), so it also works for clubs with a custom background color; "System" follows the OS `prefers-color-scheme` live, without a reload
- Global search (🔍 header icon or Cmd/Ctrl+K) — jumps straight to a member, their treasury account, a past evening, a payment/expense booking, an announcement, or a Kegelfahrt via the same deep-link hashes push notifications already use; each result group has an icon, dates are shown in localized long form, and the query also matches written-out month names in the active language (e.g. "March"/"März")
- Toast notifications for every create/update/delete action
- AdminGuard component — wraps any section to show a lock icon to non-admins
- Mobile-optimised layout with a thumb-friendly bottom tab bar (frosted-glass, safe-area aware) and bottom sheet drawers; on wide screens (≥1024px) the same navigation becomes a left side rail so desktop/tablet uses the extra width
- Page-switch enter transition, pressed-state feedback on nav buttons, and a global keyboard `:focus-visible` ring; all shell animations respect `prefers-reduced-motion`
- German and English translations, user-selectable
- Accessibility: WCAG-AA muted-text contrast, keyboard-operable chart points/segments (StatsPage, TreasuryPage), focus-managed bottom sheets (focus moves in on open, restores to the trigger on close), larger touch targets and `aria-label`s on icon-only buttons (sheet close, throw edit/void, camera close)
- Responsiveness: Tablet Schnellerfassung's three-column layout stacks (penalty/drink actions first) on narrower or portrait tablets instead of breaking down
- Evening hub sub-tab strip scrolls horizontally instead of truncating labels — same tab pattern used across the rest of the app
- Member rows (app users, roster, guests) are tap-to-open instead of stacking multiple icon-only buttons — tapping a row opens an action sheet listing every available action with an icon and text label
- **Easter egg** — tapping the club logo/title in the header 5× quickly opens a hidden mini 9-pin bowling game, rendered in **pseudo-3D perspective** (wooden lane, green side rails, a VOLLMER-style back machine with a standing-pin lamp diamond, a green **7-segment scoreboard** for the current throw + running total, and a little **Wimpel carrying the club logo**). **Swipe up** the lane to throw — direction sets the aim, length the power — and watch the pins topple. The nine pins stand as a proper square diamond hard against the machine at the **back** of the lane, spanning its **full width**, and toppled pins sweep their whole length across the deck as they fall (which is what lets a sparse German diamond be cleared at all). Three throws per game, each with a fresh rack of nine (max score 3×9 = **27**). Finished games go to a **club-wide top-10 leaderboard** (backend-persisted, attributed by Kegelname), revealed in the **profile** (Meine Saison tab) once a player has found the Easter egg — labelled as the **mini-game** leaderboard so it is never mistaken for real club results; a local best is kept as an offline fallback

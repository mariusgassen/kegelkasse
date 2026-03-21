# 🎳 Kegelkasse — Kegelclub Manager

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

### Club administration *(admin only)*

- Club settings: home venue, primary and secondary brand colors, PayPal.me handle, background color, no-show penalty
- **Regular members (Stammspieler)**: persistent roster with optional nickname; used to link evening players across sessions for stat tracking
- **Penalty types**: custom icon (emoji), name, default amount, sort order; soft-deleted when removed
- **Game templates**: name, description, winner type (`team` / `individual` / `either`), opener flag, president-game flag, default loser penalty, sort order; soft-deleted when removed
- **Teams**: reusable team presets that can be loaded when starting an evening
- **Pins (Vereinsnadeln)**: assign pin holders, evening-alert when a holder is present, one-click penalty entry; pin icons shown inline next to player names
- **Presidents**: annual Präsidentenspiel (🎯-flag), president history with tab view and history badge; 🎯 badge shown inline next to player name
- **Vergnügungsausschuss (Entertainment Committee)**: designate regular members as VA-members (is_committee flag); committee members can post announcements (with push notification to all) and manage Kegelfahrten (bowling trips); dedicated 🚌 tab for all members; VA management in the admin Verein tab

### Evening management

- Evenings are started from a scheduled entry (SchedulePage); no more ad-hoc creation
- Create evenings with date, optional venue override, and a free-text note
- Open/close toggle — closing an evening archives it to history
- Add players ad-hoc or from the regular-member roster (linking them for stats)
- **Highlights**: record memorable moments (Schuh geworfen, Kugel gegen die Heizung…) as free-text highlights on the evening
- Create named teams and assign players to them; reassign or dissolve teams at any time
- 30-second live polling so all connected users see changes without refresh

### Penalties

- Apply a penalty to one or more individual players in a single action
- Apply a team penalty — automatically fans out to every player on the team
- Penalty amount and mode (`euro` / `count`) are independently editable after creation
- Soft-delete (undo) without data loss
- Spin wheel for random penalty-type selection
- Absence penalties for missing regular members

### Games

- Record game results from a template or as a free-form entry
- Winner can be a player (`p:<id>`) or a team (`t:<id>`)
- Optional pin scores per player/team stored as a JSON map
- Opener flag highlights the crown game (König) in the UI
- Configurable loser penalty: when set, penalty log entries are auto-created for every non-winner player when the game is finished
- Soft-delete (undo) without data loss

### Drinks

- Log beer or shot rounds with an optional variety label
- Track which players participated in each round
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
- Member accounts: track balances and record payments (admin)
- Club expenses (e.g. lane rental) tracked separately
- **Bezahllink**: members request payment via PayPal.me link; admin confirms manually
- **Report export**: admins download a full treasury report as Excel (.xlsx) or PDF — 6 sections: summary, member accounts, all transactions, penalties by member, penalties by evening, evenings overview; optional year filter; automated push notification to admins before the next bowling evening (configurable in club settings)

### Statistics

- Yearly rollup by regular member: evenings attended, total penalty amount (€), penalty count, game wins, beer rounds, shot rounds
- Personal stats in user profile
- Year selector with CSS bar chart visualization

### Push notifications & reminders

- Web Push via VAPID — works on Android Chrome, Safari, and desktop browsers
- Notifications sent for: penalty added, absence penalty, game loser penalty, evening closed, payment confirmed/rejected, schedule reminders
- Members subscribe/unsubscribe per device from their profile
- Per-category notification preferences (penalties, evenings, schedule, payments, games, members, reminders)
- Falls back silently when VAPID keys are not configured
- **Automated reminders** (scheduled daily at 09:00 via APScheduler):
  - Weekly debt reminder — push to members with outstanding balance above a configurable threshold (configurable weekday)
  - Upcoming evening — push N days before each scheduled event; each user sets their own preferred lead time (default from club settings)
  - RSVP reminder — push to members who haven't responded N days before an event
  - Bowling-day debt reminder — push to debtors on the day of a scheduled evening
  - Pending payment request nudge — push to admins when requests stay unresolved past N days
- Admins enable/disable and configure each reminder type in the club settings (Einstellungen-Tab)
- Users opt out per reminder category in their profile
- **Broadcast push**: admins can send a custom push to all club members from the settings page

### PWA & offline

- Service worker caches API responses and static assets
- IndexedDB for local data; delta sync endpoint reconciles offline changes
- Offline banner visible when network is unavailable
- Installable on mobile home screen

### UI / UX

- Dark/light mode toggle
- Toast notifications for every create/update/delete action
- AdminGuard component — wraps any section to show a lock icon to non-admins
- Mobile-optimised layout with tab navigation and bottom sheet drawers
- German and English translations, user-selectable

# 🐿️ Kegelkasse Kegelclub Manager

Full-stack bowling club management PWA with offline sync, i18n (DE/EN), and role-based access.

## Stack

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| Backend    | FastAPI + PostgreSQL + Alembic               |
| Frontend   | React 18 + TypeScript + Vite + Tailwind      |
| PWA        | vite-plugin-pwa + Service Worker + IndexedDB |
| Auth       | JWT + bcrypt, invite-link registration       |
| i18n       | State-based translation system (de/en)       |
| Deployment | Docker Compose → Coolify                     |

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
3. Set env vars (see .env.example)
4. Deploy — migrations + admin seed run automatically

## Roles

| Role       | Access                                   |
|------------|------------------------------------------|
| superadmin | Everything                               |
| admin      | Club settings, templates, invite members |
| member     | Evenings, penalties, games, drinks       |

## Feature catalog

### Authentication & users
- Email/password login with JWT tokens (7-day expiry by default)
- Invite-link registration — admin generates a one-time token, user self-registers via link
- Per-user language preference (DE/EN), persisted server-side
- Admin can promote/demote members between `member` and `admin` roles

### Club administration *(admin only)*
- Club settings: home venue, primary and secondary brand colors
- **Regular members (Stammspieler)**: persistent roster with optional nickname; used to link evening players across sessions for stat tracking
- **Penalty types**: custom icon (emoji), name, default amount, sort order; soft-deleted when removed
- **Game templates**: name, description, winner type (`team` / `individual` / `either`), opener flag, default loser penalty, sort order; soft-deleted when removed

### Evening management
- Create evenings with date, optional venue override, and a free-text note
- Open/close toggle — closing an evening archives it to history
- Add players ad-hoc or from the regular-member roster (linking them for stats)
- Create named teams and assign players to them; reassign or dissolve teams at any time
- 30-second live polling so all connected users see changes without refresh

### Penalties
- Apply a penalty to one or more individual players in a single action
- Apply a team penalty — automatically fans out to every player on the team
- Penalty amount and mode (`euro` / `count`) are independently editable after creation
- Soft-delete (undo) without data loss
- Spin wheel for random penalty-type selection

### Games
- Record game results from a template or as a free-form entry
- Winner can be a player (`p:<id>`) or a team (`t:<id>`)
- Optional pin scores per player/team stored as a JSON map
- Opener flag highlights the crown game in the UI
- Configurable loser penalty: when set, penalty log entries are auto-created for every non-winner player when the game is saved
- Soft-delete (undo) without data loss

### Drinks
- Log beer or shot rounds with an optional variety label
- Track which players participated in each round
- Soft-delete (undo) without data loss

### Statistics
- Yearly rollup by regular member: evenings attended, total penalty amount (€), penalty count, game wins, beer rounds, shot rounds
- Overall evening count and total penalties for the selected year

### PWA & offline
- Service worker caches API responses and static assets
- IndexedDB for local data; delta sync endpoint reconciles offline changes
- Offline banner visible when network is unavailable
- Installable on mobile home screen

### UI / UX
- Dark/light mode toggle
- Toast notifications for every create/update/delete action
- AdminGuard component — wraps any section to show a lock icon to non-admins instead of hiding content entirely
- Mobile-optimised layout with tab navigation and bottom sheet drawers
- German and English translations, user-selectable
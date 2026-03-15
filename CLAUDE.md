# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kegelkasse Kegelclub Manager — a full-stack 9-pin bowling club management PWA.
Manages evenings, games, penalties, member rosters, and treasury with offline-first capabilities and German/English i18n.

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

**Backend:** FastAPI + PostgreSQL + SQLAlchemy ORM + Alembic migrations. Runs inside Docker. API versioned at `/api/v1/`. Serves the React SPA as static files in production (mounts build to `/assets`, fallback to `index.html`).

**Frontend:** React 18 + TypeScript + Vite. State via Zustand (persists `user` and `activeEveningId`). REST API calls with JWT Bearer auth via `frontend/src/api/client.ts`. Real-time updates via 30s polling on the evening page. PWA with service worker + IndexedDB for offline support.

**Auth flow:** JWT tokens, bcrypt passwords, invite-based registration (one-time tokens). Three roles: `superadmin`, `admin`, `member`.

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI app setup, route registration, CORS, static serving |
| `backend/app/core/config.py` | Environment settings |
| `backend/app/core/security.py` | JWT + password hashing |
| `backend/app/api/deps.py` | Auth dependencies, role checks |
| `backend/app/api/v1/evenings.py` | Main business logic (50+ endpoints) |
| `backend/alembic/versions/001_initial_schema.py` | Full DB schema |
| `frontend/src/App.tsx` | Router, header, nav, boot/auth flow |
| `frontend/src/store/app.ts` | Zustand store, role helpers |
| `frontend/src/api/client.ts` | All API calls |
| `frontend/src/types.ts` | Shared TypeScript interfaces |
| `frontend/vite.config.ts` | Vite + PWA config, API proxy |

## Data Model

- `Club` → `RegularMembers`, `PenaltyTypes`, `GameTemplates`, `Evenings`
- `Evening` → `EveningPlayers`, `Teams`, `Games`, `PenaltyLog`, `DrinkRounds`
- Soft deletes via `is_deleted` flag on `Game` and `PenaltyLog`
- `Evening.is_closed` archives to history

## Deployment

Push to Git → Coolify builds Docker Compose. The `docker/entrypoint.sh` auto-runs migrations and admin seed on container start. No manual migration steps needed in production.
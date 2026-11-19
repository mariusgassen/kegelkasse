# 🎳 Kegelkasse — Kegelclub Manager

[![Backend Tests](https://github.com/mariusgassen/kegelkasse/actions/workflows/backend-tests.yml/badge.svg)](https://github.com/mariusgassen/kegelkasse/actions/workflows/backend-tests.yml)
[![Frontend Tests](https://github.com/mariusgassen/kegelkasse/actions/workflows/frontend-tests.yml/badge.svg)](https://github.com/mariusgassen/kegelkasse/actions/workflows/frontend-tests.yml)

Full-stack 9-pin bowling club management PWA: evenings, games, penalties, drinks, treasury, schedule/RSVP,
statistics, push/email notifications, offline sync, DE/EN, role-based access (superadmin / admin / member).

**Stack:** FastAPI + PostgreSQL + Alembic · React + TypeScript + Vite + Tailwind · PWA (service worker + IndexedDB) ·
JWT auth · Docker Compose → Coolify.

## Development

```bash
cp .env.example .env          # set DATABASE_URL, SECRET_KEY, FIRST_SUPERADMIN_EMAIL/PASSWORD
docker compose -f docker-compose.dev.yml up -d
docker compose exec app alembic upgrade head
docker compose exec app python -m app.scripts.create_admin
# API docs: http://localhost:8000/api/docs
cd frontend && npm install && npm run dev   # → http://localhost:5173
```

Docs (German, Docusaurus): `cd docs && npm install && npm start` → http://localhost:3000

## Roadmap MCP

The backend exposes a Streamable-HTTP MCP server at `/mcp` for managing the in-app roadmap (`list_roadmap_items`, `create_roadmap_item`, `move_roadmap_status`, `update_roadmap_item`, `delete_roadmap_item`, comments, votes, summary).

- **Remote HTTP (`.mcp.json`):** Point to `https://<host>/mcp` with `Authorization: Bearer <MCP_API_TOKEN or user JWT>` (set `MCP_API_TOKEN` on the server to act as platform superadmin).
- **Local `stdio` wrapper:** `uv run backend/app/mcp_roadmap_stdio.py` (supports `KEGELKASSE_URL` + `KEGELKASSE_MCP_TOKEN` / `KEGELKASSE_TOKEN`, or `KEGELKASSE_EMAIL` + `KEGELKASSE_PASSWORD` with automatic JWT refresh). See `.mcp.json.example`.

## Deployment

Push to Git; Coolify builds the Docker Compose stack. Migrations and admin seed run on container start.
Configure via env vars (see `.env.example`).

## Releases

[release-please](https://github.com/googleapis/release-please) manages versions and `CHANGELOG.md`. PRs are
squash-merged, so the **PR title must be a [Conventional Commit](https://www.conventionalcommits.org/)**:

| Type | Effect |
|---|---|
| `feat` | minor release |
| `fix`, `perf`, `deps`, `revert` | patch release |
| `docs`, `refactor`, `test`, `ci`, `build`, `chore` | no release |
| `feat!:` / `BREAKING CHANGE:` footer | major release |

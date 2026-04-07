# Lessons Learned

Patterns and rules accumulated from corrections and experience in this project.
Updated after every significant correction — reviewed at session start.

---

## Code & Architecture

### i18n
- Always add keys to `de.ts` first, then `en.ts` in the same commit. Never leave them out of sync.
- Run the i18n parity Vitest test locally to catch missing keys before pushing.

### Migrations
- Never modify an existing migration. Always create a new numbered file (`NNN_description.py`).
- After adding a migration, run `alembic upgrade head` in Docker before writing tests — catch SQL errors early.

### Backend dependencies
- After any change to `backend/pyproject.toml`, immediately run `cd backend && poetry lock` and commit both files together.

### Game loser penalties
- Always created via the `finish_game` endpoint, never `add_game`. Identified by `penalty_log.game_id`.
- On re-edit: old penalties deleted first, then new ones created.

---

## Testing

### General
- Every new API endpoint needs pytest tests: happy path + 401 + 403 + main error cases (404, 400).
- Every new frontend utility/store action needs a Vitest test. Never defer tests to "later".
- Run `cd backend && poetry run pytest -q` and `cd frontend && npm run build` before every push.

### Cleanup fixtures
- Each pytest module needs an autouse `cleanup` fixture that deletes rows in correct FK order (children before parents) and depends on `club` so it runs before club teardown.

### ESLint
- Do not run `eslint` locally — check via CI after pushing. Only `npm run build` locally.

---

## Git & CI

### Commits
- Run `cd backend && poetry run ruff check app/` and `cd frontend && npm run build` before every push.
- Fix all TypeScript and ruff errors before pushing — never push with a red build.

### Branch discipline
- Always develop on the designated feature branch. Never push to `main` directly.

---

## UI & Design

### Display names
- Always use `member.nickname || member.name` — never `member.name` alone when a nickname exists.

### "Ich" badge
- Every member list needs the amber `Ich` badge next to the current user's entry.

### Current user first
- Non-ranking lists always sort the current user to the top.

### Sync after mutations
- After every create/update/delete, immediately re-fetch all affected lists. Never rely on optimistic state alone.

---

## Versioning
- Bump `frontend/package.json` version with every release or significant feature. Never edit the displayed version elsewhere.

# CLAUDE.md

Kegelkasse — full-stack 9-pin bowling club PWA (FastAPI + PostgreSQL + SQLAlchemy/Alembic backend, React 19 + TypeScript + Vite + Zustand frontend). German/English i18n, offline-first.

## Commands

```bash
docker compose -f docker-compose.dev.yml up -d          # dev environment
docker compose exec app alembic upgrade head            # migrations
docker compose exec app python -m app.scripts.create_admin
cd frontend && npm install && npm run dev|build|lint    # :5173
cd backend && poetry run pytest tests/test_<module>.py  # also: poetry run ruff check .
```

API docs: http://localhost:8000/api/docs. Env: copy `.env.example` to `.env`.

## Architecture

- Backend: `backend/app/` — `main.py`, `core/` (config, security), `api/deps.py` (auth/role deps), `api/v1/*` (routers; `evenings.py` holds the main business logic). API under `/api/v1/`; prod serves the built SPA.
- Frontend: `frontend/src/` — `App.tsx`/`RootLayout.tsx` (shell), `router.tsx` (TanStack Router), `store/app.ts` (Zustand, persists only `user` + `activeEveningId`), `api/client.ts` (all fetch calls), `types.ts`, `i18n/de.ts` (source of truth) + `en.ts`.
- Auth: JWT access token + rotating refresh token, invite-based registration, roles `superadmin` / `admin` / `member`.
- Soft deletes via `is_deleted` (`Game`, `PenaltyLog`, payments/expenses). Game loser penalties are created only by `finish_game` (identified by `penalty_log.game_id`; re-edit deletes and recreates them).
- Uploaded media goes through `core/storage.py` and is served at `/uploads/<key>`.

## Rules

**Workflow**
- Non-trivial task (3+ steps / architecture): state a brief plan first; if it goes sideways, stop and re-plan. Fix bug reports autonomously. Keep changes minimal, find root causes, touch only what's necessary.
- Don't create `tasks/todo.md`, `tasks/lessons.md` or other tracked planning files.
- Don't push code you expect to fail CI. CI (lint, build, ruff, pytest, Vitest) is the gate: don't run full suites locally as a pre-push ritual — run only the test files for what you changed, push, and watch the PR checks (`subscribe_pr_activity`). Fix any CI errors before the PR is mergeable.
- Multiple agents work off `main` concurrently: before pushing and again after CI, `git fetch origin main`, check `git log HEAD..origin/main`, and rebase if it moved.

**Releases & PRs**
- Never bump versions by hand (release-please). PRs are squash-merged, so the **PR title must be a Conventional Commit** written for club members (`feat:` minor; `fix:`/`perf:`/`deps:` patch; `feat!:` major; `docs`/`refactor`/`test`/`ci`/`build`/`chore` no release).

**Backend**
- Migrations: one file per DB change, numbered `NNN_description.py`; never modify existing ones.
- Admin guards: `require_club_admin` (backend), `isAdmin(user)` / `<AdminGuard>` (frontend).
- After changing `backend/pyproject.toml`, run `cd backend && poetry lock` and commit both files.
- Keep dependencies current; handle Dependabot PRs promptly (merge safe patch/minor, do major migrations immediately). Known caps: `eslint-plugin-react-hooks@7` requires ESLint `^9`; `typescript` stays `^6.x` until `@typescript-eslint` supports TS7.

**Frontend**
- i18n: all UI strings via `useT()`; add keys to `de.ts` first, then `en.ts` (keys `scope.sub.key`).
- API calls only in `api/client.ts`, typed with `types.ts`. Errors via `toastError`/`showToast`.
- After any mutation, invalidate/refetch all affected queries (including dependent ones, e.g. payment request → `['payment-requests']`, `['my-balance']`); never rely on optimistic state alone.
- Reuse shared primitives in `components/ui/` (`Sheet`, `MemberRow`, `Avatar`, `MemberBadges`/`MeBadge`, `StatTile`, `ExpandableCard`, `ActionSheet`/`CardActionMenu`, `ZoomableImage`, skeletons, `CountUp`) instead of re-rolling them. Every bottom sheet is `<Sheet>`.
- Display names: `member.nickname || member.name` everywhere. Mark the current user with `<MeBadge/>` (`common.me`) and sort them first in non-ranking lists.
- Colors: semantic tokens only (from `lib/tokens.ts`; `-fg` = readable as text, `on-` = text on a fill) — never hex/`rgba`/Tailwind palette colors in UI chrome. Kiosk views (`TabletQuickEntryPage`, `CameraCapturePage`, `BowlingGame`) are dark-only.
- Type scale: 12px (`text-xs`) is the minimum; no `text-[10px]`-style sizes. SVG text is sized against its viewBox.
- Motion: use `--motion-*`/`--ease-*` tokens or `lib/motion.ts` (`DURATION`/`EASING`), never hardcoded durations; add new animations to the `prefers-reduced-motion` block. `prefersReducedMotion()` gates structural motion, `flourishEnabled()` gates extras.
- Touch/icon rules (enforced by `lib/__tests__/iconAffordance.test.ts`): no `title=` on native elements; icon-only buttons need `aria-label`; Lucide = controls, emoji = content; ≥2 icon buttons per row → `<CardActionMenu>`; tappable rows show a chevron.

**Testing**
- Every new feature ships with tests. Backend: pytest per endpoint (happy path, 401/403, 404/400) with an autouse `cleanup` fixture. Frontend: Vitest for new utilities/store actions/logic in `__tests__/`; restore stubs in `afterEach`.

**Docs**
- When a user-facing feature changes, update the relevant page in `docs/docs/` before committing.

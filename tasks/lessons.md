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
- Don't run the full pytest/build/lint suite locally before every push — CI runs it all in a few minutes. Push, then
  `subscribe_pr_activity` and watch the PR's check runs. Only run the specific file(s) you touched locally if you
  want faster iteration feedback.

### Cleanup fixtures
- Each pytest module needs an autouse `cleanup` fixture that deletes rows in correct FK order (children before parents) and depends on `club` so it runs before club teardown.

### ESLint
- Do not run `eslint` locally — check via CI after pushing. Only `npm run build` locally.

---

## Git & CI

### Commits
- Don't run `ruff check` / `npm run build` locally as a pre-push ritual — CI (`backend-build.yml`,
  `frontend-build.yml`) gates on both and finishes in a few minutes. Push and watch the PR's checks instead.
- Fix all TypeScript and ruff errors before the PR is mergeable — never leave a PR with a red build, whether you
  caught the error locally or via CI.

### Branch discipline
- Always develop on the designated feature branch. Never push to `main` directly.

### Parallel agents & rebasing
- Multiple agents work on separate branches off `main` at the same time, so branches routinely fall behind. Before
  pushing, `git fetch origin main` and check for divergence (`git log HEAD..origin/main --oneline`); rebase if
  `main` moved. Check again after CI finishes on the PR — `main` can move again while CI was running — and
  re-rebase before treating the PR as mergeable.

---

## UI & Design

### Reach for the shared primitive first
- Before hand-rolling a member row, avatar, stat tile, disclosure card, action menu or bottom sheet,
  check `components/ui/` — `MemberRow`, `Avatar`, `MemberBadges`, `StatTile`, `ExpandableCard`,
  `ActionSheet`, `Sheet` all exist. Copying the markup is how the 23 divergent `Ich` badges happened.
- A convention that can only be expressed as prose is a missing component.

### Display names
- Always use `member.nickname || member.name` — never `member.name` alone when a nickname exists.
  This includes the avatar initial, not just the label.

### "Ich" badge
- Every member list marks the current user — `<MemberRow isMe>` or `<MeBadge/>`, never a hand-written span.
- The label is the i18n key `common.me`. Page tests mock `useT` as identity, so assert on `'common.me'`.

### Touch affordance
- Never put meaning in a `title` tooltip — it does not exist on touch. Use `aria-label`, and assert with
  `getByLabelText` rather than `getByTitle`.

### Current user first
- Non-ranking lists always sort the current user to the top.

### Sync after mutations
- After every create/update/delete, immediately re-fetch all affected lists. Never rely on optimistic state alone.

### Motion
- Durations/easings come from `--motion-*` / `--ease-*` or `lib/motion.ts`. Never hardcode a new `.22s` or a fourth
  `cubic-bezier` — a test pins the CSS and JS halves together.
- Add every new animation to the `prefers-reduced-motion` block in the same edit. That block silently covered three
  of eight animations until #72.
- `prefersReducedMotion()` gates structural motion, `flourishEnabled()` gates the extras. A skeleton is a loading
  state, not an effect — never put one behind the 🎉 celebration switch.
- **`requestAnimationFrame` is not a guarantee.** Browsers throttle or suspend it in a backgrounded tab, so any
  rAF tween needs a `setTimeout` backstop that lands the final value — otherwise a wrong number stays on screen.
  This showed up as a flaky treasury test stuck on `+9,95 €` instead of `+10,00 €`.
- Replacing a text loading state with a visual one removes the only thing a screen reader had to announce. Wrap
  skeletons in `role="status"` with an sr-only label instead.

---

## Versioning
- Bump `frontend/package.json` version with every release or significant feature. Never edit the displayed version elsewhere.

#!/usr/bin/env bash
# Publish a generated coverage badge to the `badges` branch.
#
# main is protected by a ruleset (PRs + required status checks), so CI can no
# longer push badge commits to it. Badges live on their own unprotected orphan
# branch instead; README links point at raw.githubusercontent.com/.../badges/.
#
# Usage: publish-badge.sh <path-to-svg>
set -euo pipefail

src="$1"
name="$(basename "$src")"
repo="$(git rev-parse --show-toplevel)"
wt="${RUNNER_TEMP:-/tmp}/badges-wt"

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

rm -rf "$wt"
git worktree prune
if git fetch -q origin badges 2>/dev/null; then
  git worktree add -q --detach "$wt" FETCH_HEAD
else
  git worktree add -q --detach "$wt"
  git -C "$wt" checkout -q --orphan badges
  git -C "$wt" rm -rqf --ignore-unmatch .
fi

cp "$src" "$wt/$name"
cd "$wt"
git add "$name"
if git diff --staged --quiet; then
  echo "Badge $name unchanged"
  exit 0
fi
git commit -qm "chore: update $name"

# Frontend and backend jobs publish concurrently — rebase and retry on a race.
for _ in 1 2 3 4; do
  if git push -q origin HEAD:refs/heads/badges; then
    echo "Published $name"
    exit 0
  fi
  sleep 2
  git fetch -q origin badges
  git rebase -q FETCH_HEAD
done
echo "Failed to publish $name" >&2
exit 1

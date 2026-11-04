#!/usr/bin/env python3
"""Triage open Dependabot PRs: merge green ones, hand red ones to Claude.

Runs from .github/workflows/dependabot-autopilot.yml. For every open,
non-draft PR authored by Dependabot:

* checks still running / no checks yet  -> wait for the next run
* merge conflict                         -> wait (Dependabot rebases on its own)
* all checks green, not a major bump     -> squash-merge
* all checks green, major bump           -> label `autopilot:major`, leave for a human
                                            (unless AUTO_MERGE_MAJOR=true)
* a check failed, no fix attempted yet   -> emit the PR for the Claude fix job
* a check failed after a fix attempt     -> label `autopilot:needs-human`, stop

Writes the PRs to fix as a JSON list to $GITHUB_OUTPUT (`fix_matrix`).
Set DRY_RUN=true to only print decisions.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

LABEL_FIX_ATTEMPTED = "autopilot:fix-attempted"
LABEL_NEEDS_HUMAN = "autopilot:needs-human"
LABEL_MAJOR = "autopilot:major"
LABEL_SKIP = "autopilot:skip"

LABELS = {
    LABEL_FIX_ATTEMPTED: ("c5def5", "Claude already tried to fix CI on this Dependabot PR"),
    LABEL_NEEDS_HUMAN: ("d93f0b", "Autopilot gave up: CI still red after a Claude fix attempt"),
    LABEL_MAJOR: ("fbca04", "Green major-version bump, waiting for manual review"),
    LABEL_SKIP: ("ededed", "Dependabot autopilot ignores this PR"),
}

FAILED = {"FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE", "ERROR"}
PASSED = {"SUCCESS", "NEUTRAL", "SKIPPED"}

DRY_RUN = os.environ.get("DRY_RUN", "false").lower() == "true"
AUTO_MERGE_MAJOR = os.environ.get("AUTO_MERGE_MAJOR", "false").lower() == "true"

# "Bump foo from 1.2.3 to 1.3.0" (title / single PR) and
# "Updates `foo` from 1.2.3 to 1.3.0" (one line per package in grouped PRs).
VERSION_RE = re.compile(r"from v?(\d[\w.\-+]*) to v?(\d[\w.\-+]*)")


def gh(*args: str, check: bool = True) -> str:
    res = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and res.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} failed: {res.stderr.strip()}")
    return res.stdout


def act(*args: str) -> None:
    print(f"    -> gh {' '.join(args)}")
    if not DRY_RUN:
        gh(*args)


def _major_key(version: str) -> tuple[int, ...]:
    """The part of a version whose change is breaking under semver (0.x counts minor)."""
    nums = [int(n) for n in re.findall(r"\d+", version)[:3]]
    if not nums:
        return ()
    if nums[0] == 0 and len(nums) > 1:
        return (0, nums[1])
    return (nums[0],)


def is_major(title: str, body: str) -> bool:
    lines = [title] + [
        ln for ln in body.splitlines() if ln.startswith(("Updates `", "Bumps "))
    ]
    pairs = [m for ln in lines for m in VERSION_RE.findall(ln)]
    if not pairs:
        # Can't tell what changed -> treat as major so a human looks at it.
        return True
    return any(_major_key(a) != _major_key(b) for a, b in pairs)


def check_state(rollup: list[dict]) -> str:
    if not rollup:
        return "pending"
    state = "pass"
    for c in rollup:
        if c.get("__typename") == "StatusContext":
            s = c.get("state", "")
            if s in FAILED:
                return "fail"
            if s != "SUCCESS":
                state = "pending"
        else:
            if c.get("status") != "COMPLETED":
                state = "pending"
            elif c.get("conclusion") in FAILED:
                return "fail"
            elif c.get("conclusion") not in PASSED:
                state = "pending"
    return state


def ensure_labels() -> None:
    for name, (color, desc) in LABELS.items():
        if not DRY_RUN:
            gh("label", "create", name, "--color", color, "--description", desc, "--force")


def main() -> int:
    ensure_labels()
    prs = json.loads(gh(
        "pr", "list", "--state", "open", "--author", "app/dependabot", "--limit", "50",
        "--json", "number,title,body,isDraft,labels,mergeable,headRefName,headRefOid,"
                  "statusCheckRollup",
    ))
    to_fix: list[dict] = []

    for pr in prs:
        n = str(pr["number"])
        labels = {lb["name"] for lb in pr["labels"]}
        state = check_state(pr["statusCheckRollup"])
        major = is_major(pr["title"], pr["body"] or "")
        print(f"#{n} [{state}{', major' if major else ''}] {pr['title']}")

        if pr["isDraft"] or LABEL_SKIP in labels:
            print("    skip (draft / autopilot:skip)")
            continue
        if pr["mergeable"] == "CONFLICTING":
            print("    conflict, waiting for Dependabot to rebase")
            continue
        if state == "pending":
            print("    checks pending")
            continue

        if state == "pass":
            if major and not AUTO_MERGE_MAJOR:
                if LABEL_MAJOR not in labels:
                    act("pr", "edit", n, "--add-label", LABEL_MAJOR)
                    act("pr", "comment", n, "--body",
                        "CI is green, but this includes a **major** version bump, so the "
                        "Dependabot autopilot leaves the merge to a human.")
                continue
            act("pr", "merge", n, "--squash", "--delete-branch",
                "--match-head-commit", pr["headRefOid"])
            continue

        # state == "fail"
        if LABEL_NEEDS_HUMAN in labels:
            print("    already handed to a human")
            continue
        if LABEL_FIX_ATTEMPTED in labels:
            act("pr", "edit", n, "--add-label", LABEL_NEEDS_HUMAN)
            act("pr", "comment", n, "--body",
                "CI is still red after Claude's fix attempt. The Dependabot autopilot "
                "stops here; please take a look.")
            continue
        to_fix.append({"number": pr["number"], "branch": pr["headRefName"],
                       "sha": pr["headRefOid"], "title": pr["title"]})

    print(f"PRs for Claude to fix: {[p['number'] for p in to_fix]}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a") as fh:
            fh.write(f"fix_matrix={json.dumps(to_fix)}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

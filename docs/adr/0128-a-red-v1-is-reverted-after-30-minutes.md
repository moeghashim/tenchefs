# A red v1 opens a fix-forward issue, and its first red commit is reverted after 30 minutes

2026-11-26 (mattpocock/cookout#638, spec #631, "A red v1"). Matt decided on the board on 2026-11-25 (msgs 5092 and 5094).

## Context

Since [ADR 0127](0127-a-worker-lands-its-own-pull-request-after-its-pull-request-check-is-green.md), a worker lands its own pull request once its pull request's Check is green. A red v1 still happens: from a flake (#760), or from two pull requests that pass alone and break together. Release ships only a green v1 commit ([ADR 0114](0114-release-is-the-gate-on-the-newest-green-v1-commit.md)), so a red v1 that nobody fixes stops every release behind it.

## Decision

- **The Red v1 workflow** (`.github/workflows/red-v1.yml`) runs when Check completes on v1, and every 5 minutes. A schedule registers only from a push that starts workflows (#744), and main moves by Release's token, so the schedule may never fire: a run that is waiting for the 30-minute mark sleeps until then in the same run and decides again, as Release waits out its gate spacing ([ADR 0121](0121-release-waits-out-the-gate-spacing-instead-of-a-schedule.md)). Its one step, `scripts/red-v1.ts`, reads v1's Check push and `workflow_dispatch` runs and its first-parent history, and the decision is a pure function over them (`scripts/lib/red-v1.ts`).
- **A flake is retried once.** A red run's failed jobs are rerun once (`gh run rerun <id> --failed`), and the rerun is judged: only a red rerun counts as red. A cancelled run is no verdict.
- **One fix-forward issue.** On a red v1 it opens one issue, not one per run, titled `v1 is red: <failed jobs> since <short sha>`, naming the failed jobs and their failing tests, the first red commit after the newest green one, the pull request that merged it, and every commit since the newest green run. A hidden marker in its body names the first red commit, so the next run finds the issue rather than opening another. When v1 goes green, it comments and closes the issue.
- **The revert.** 30 minutes after the first red commit's red run completed, if v1 has had no green Check run since, it reverts that commit on v1 (`git revert -m 1` for a merge commit, a plain revert otherwise), pushes without force, and starts Check on v1 by `workflow_dispatch`, since a push with the workflow's token starts no workflow. It comments on the issue and on the reverted pull request that the work must land again. While a Check run on a newer v1 commit is still running at the 30-minute mark, or a newer red run waits for its rerun, it waits for that run's result. A revert that conflicts pushes nothing and says so on the issue. It never reverts the same commit twice: a commit v1's history already reverts, or whose revert the issue says was tried, is skipped.
- **A dry run.** `node scripts/red-v1.ts --dry-run` prints what it would do; `--at <time> --assume-reruns-fail` reads v1 as it stood at a past time, for a dry run on a past red v1. The workflow's `workflow_dispatch` defaults to a dry run.

## Consequences

- A reverted pull request says so. Its worker reopens the ticket, fixes the cause on its branch, and lands again by the landing steps.
- A fix-forward that lands within 30 minutes of the red run, and goes green, closes the issue and no revert happens.
- Release reads only Check push runs, so the `workflow_dispatch` Check run on a revert doesn't make Release ship it; the next push to v1 does.
- The workflow needs `contents: write` (v1 isn't protected), `actions: write`, `issues: write` and `pull-requests: write` on its own token, and no secret.

Superseded in part on 2026-11-26 by [ADR 0129](0129-release-counts-a-dispatched-check-on-v1-s-head.md): a green Check run on v1's head started by `workflow_dispatch` now releases it.

# Release waits out the gate spacing instead of a schedule

2026-11-25 (mattpocock/cookout#744). The ticket is the cookout chief of staff's, on board thread 5743: find why Release's 10-minute schedule never fires, and fix it in the repository if the cause is there, without changing the 30-minute gate spacing.

## Context

Release (#637) ran on `workflow_run` when Check completed on v1 and on `schedule: */10 * * * *`, so a commit skipped because a gate run started under 30 minutes ago was picked up later. No run with event `schedule` was ever created. Since 2026-11-25 13:45 UTC every push to main is Release's own `move main` job, by `github-actions[bot]` with the workflow's `GITHUB_TOKEN` (the repository's activity for `refs/heads/main`); the cron reached main in such pushes (15:44 and 18:44 UTC). GitHub documents that events caused by `GITHUB_TOKEN`, other than `workflow_dispatch` and `repository_dispatch`, create no workflow run, and it registers a workflow's schedule from the push that changes the default branch's workflow file. The Actions API still showed `release.yml`, `check.yml` and `deploy.yml` as last updated on 2026-11-23, though all three changed on main since: GitHub hadn't read them from those pushes. `workflow_run` worked, because GitHub reads the default branch's file when the event happens. Main moves only by fast-forward from Release (ADR 0114), and the ticket rules out new secrets, so no push to main can come from another token.

## Decision

- Release has no `schedule` trigger.
- When the only reason not to go ahead is a gate run under 30 minutes old, the choose job waits until that run is 30 minutes old, fetches v1 and main, chooses the newest green v1 commit again and decides again (`decideAfterWaiting` in `scripts/lib/release-go.ts`), up to 3 times. It prints `waits: a gate run started at <time>, under 30 minutes ago; deciding again at <time>`. The job's limit is 40 minutes.

## Consequences

A skipped commit ships when the spacing allows, with no hand dispatch and no schedule. While the choose job waits it holds the `release` concurrency group, so a Release run started meanwhile stays pending (a newer one replaces it) and then decides as usual, usually that the commit is deployed. A waiting run uses up to 30 minutes of runner time.

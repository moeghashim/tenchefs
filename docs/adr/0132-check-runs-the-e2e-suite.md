# Check runs the e2e suite

2026-11-26 (mattpocock/cookout#786).

## Context

The e2e suite (`packages/e2e` on the Docker image, `pnpm e2e:docker`) ran only in the Release workflow and in a hand-run Deploy. A worker lands its own pull request once its Check is green (ADR 0127), so a change that broke the suite landed unseen: #764 (pull request #781) landed with a green Check, Release's e2e-docker job failed (run 45804002355), and nothing deployed until #785 fixed the test. That job took 1 m 44 s, less than one `tests` shard.

## Decision

- The Check workflow has a ninth job, `e2e-docker`, running `pnpm e2e:docker` (both legs, SQLite and Postgres) in parallel with the others, on pull requests into v1, pushes to v1 and `workflow_dispatch`.
- `gh pr checks` lists it, so the landing steps wait on it unchanged.
- Release keeps its own e2e-docker job, and Deploy its own.
- A local `pnpm check` still skips the suite, and its `skipped:` line names the Check workflow's job.

## Consequences

A pull request that breaks the e2e suite gets a red Check and can't land, and the suite runs on the merged result before Release does. It runs once more per Check run, in parallel, so the Check's wall time stays that of its longest job.

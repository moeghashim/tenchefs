# A test shard that can't read the recorded timings fails

2026-11-25 (mattpocock/cookout#737). The decision is the cookout chief of staff's, on board thread 5694 (msg 5702): find why ticket-737's pull request Check run lost coverage after its merge of v1, and fix it without lowering the floor.

## Context

Each `tests` and `browser` shard picks its files on its own runner: it reads the timings the newest earlier Check run recorded and splits every test file by them ([ADR 0105](0105-check-runs-8-jobs-only-on-v1-and-merge-ticket-branches.md), `scripts/lib/timed-shards.ts`). When it couldn't read them, it fell back to Vitest's or Playwright's own split by count. That is safe only when every shard falls back. In run 45683512958, `tests 6/6` got HTTP 503 ("Egress is over the account limit") downloading one timings artifact, so it split by file count while shards 1 to 5 split by the timings of run 45682774426. Some test files then ran in no shard, every job passed, and only the `coverage` job's merge showed it: 98.27% of lines against the 99.93% floor. A browser shard falling back the same way skips browser tests with no job to notice.

## Decision

- A shard falls back to a split of its own only when every shard would: no earlier run recorded timings, no test file has a recorded time, the shard label isn't one, the files can't be listed, or it isn't a GitHub Actions run.
- When a `gh` call fails (the run's start time, an artifact listing or a download), the shard fails: `pnpm check --job=<job> --shard=<n>` prints why on stderr and ends `RESULT: FAIL (<job> shard <n>)`, running nothing. A rerun of the failed job reads the same timings as the other shards, since a shard reads only artifacts created before its own run started.

## Consequences

A GitHub outage while reading timings turns a shard red instead of quietly dropping tests. `merge-ticket` reruns a merge-ticket-N run's failed jobs once, which covers a brief one. A pull request's run gets no automatic rerun, so its failed shard is rerun from the run's page, and the coverage it then merges is whole.

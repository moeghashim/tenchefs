# Unit-test shards split by recorded time, across 6 jobs

2026-11-25 (mattpocock/cookout#707). v1's Check was red: a unit-test shard was cut off at its 5-minute limit, and a red Check holds back every Release deploy.

## Context

Vitest's `--shard` splits the test files by count. On 4-core runners the three `tests` shards took 288, 177 and 157 s of tests on bac5d036 (run 45654222304), and the first was cancelled at the job's 5-minute limit. Every web test file's environment also started its own fake routine process beside its server, though only `trigger-alerts.test.tsx` fires at one: 38% of a shard's worker time was environment setup.

## Decision

- The web project's `globalSetup` (`scripts/web-test-setup.ts`) starts one fake routine for the run and provides its URL as `webReceiverUrl`, and bundles `app/main.ts` once with tsdown to `node_modules/.cache/web-test-server/main.js` (inside `node_modules` so its dependencies resolve), again on each watch rerun. A web test file's environment starts only its server, from that bundle: it is ready in about 110 ms, against 640 ms from the TypeScript sources.
- Check runs 6 `tests` jobs. On CI each runs the test files that give it a sixth of the test time the newest earlier Check run recorded in its `test-timings-tests-*` artifacts (`.timings/tests.json`, Vitest's JSON report), the same split [ADR 0112](0112-browser-shards-split-by-recorded-time-and-tests-log-in-by-cookie.md) gives the browser shards: the slowest file first, each to the shard with the least time so far, a file with no recorded time counting as the average file (`scripts/lib/timed-shards.ts`). With no timings to read it falls back to `--shard` by file count. The shard's first line says which it did. Each writes its blob report as `blob-<index>-6.json`, and the `coverage` job merges them as before.
- A Check run has 8 jobs again (`static`, `tests` ×6 and `coverage`), the count [ADR 0105](0105-check-runs-8-jobs-only-on-v1-and-merge-ticket-branches.md) sized for 2 runs at once in the 20 concurrent jobs.

## Consequences

The `tests` jobs read the Actions API, so they have `actions: read` and `GH_TOKEN`. A shard's split is only as even as the last recorded run; a new file costs the average until a run records it.

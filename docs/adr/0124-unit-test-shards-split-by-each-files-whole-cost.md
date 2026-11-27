# Unit-test shards split by each file's whole cost

2026-11-25 (mattpocock/cookout#751, from Ruby's measurements on [#749](https://github.com/mattpocock/cookout/issues/749#issuecomment-7173428253)).

## Context

Each `tests` shard runs the test files that give it a sixth of the time the newest earlier Check run recorded ([ADR 0105](0105-check-runs-8-jobs-only-on-v1-and-merge-ticket-branches.md), `scripts/lib/timed-shards.ts`). That time came from Vitest's JSON report, which times a file from its first test's start to its last test's end. It leaves out the worker, environment, setup and import time Vitest measures for the same file, which is about 60% of a shard's wall time. A web `.tsx` file pays for its environment and a heavy import graph, and a small `scripts/` test pays for almost nothing. So shards planned at the same 104.5 s took 71 s to 124 s in run 45691168770.

## Decision

- After its tests, a CI `tests` shard runs `scripts/test-file-costs.ts`. It reads the blob report the shard already writes for the coverage merge and records each file's whole cost in `.timings/tests-costs.json`, in the shard's `test-timings-tests-<n>` artifact. The cost is the sum of `environmentLoad`, `prepareDuration`, `setupDuration`, `collectDuration` and the file's test duration, the same phases Vitest's own summary adds up. The blob is written with `flatted`, which is a dev dependency at the version Vitest itself uses.
- The next run's split weighs each file by that cost (`scripts/lib/unit-shards.ts`). An artifact without `tests-costs.json`, from a run before this change, is still split by its tests' span.
- The cost is read from the blob rather than recorded by a Vitest reporter of our own. Vitest loads a reporter given by path only from its default export, and allowing a default export there would loosen the lint config.

## Consequences

The first Check run after this lands is still split by its tests' span. Its shards record the costs, and later runs split by them. Test files share one module graph per worker (`isolate: false`), so the first file a worker runs pays for imports that later files reuse. A file's cost therefore depends a little on which shard and position it had, and the split evens out core-seconds rather than exact wall time. No budget, timeout or shard count changes.

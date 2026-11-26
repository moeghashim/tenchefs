# A failed browser shard reruns its failed tests with a trace

2026-11-25 (mattpocock/cookout#714). The ask is Matt's (the ticket: upload the traces and error context when a browser test fails, with a passing run taking no longer); the shape here is the implementer's, since `trace: retain-on-failure` broke the second half of that ask.

## Context

Release run 45656055347 failed a browser test that nobody could reproduce, and it uploaded nothing to read. The ticket asked for `trace: "retain-on-failure"`. That mode records a trace of every test and deletes it on a pass, so a passing run pays for the recording. Measured on 60 tests from 8 files, 4 workers on 4 cores, 3 runs each:

| trace                               | time of each run    | failures                      |
| ----------------------------------- | ------------------- | ----------------------------- |
| off                                 | 86 s, 87 s, 93 s    | none                          |
| `retain-on-failure`                 | 122 s, 122 s, 121 s | `inbox-open` failed once      |
| `retain-on-failure`, no screenshots | 100 s, 102 s, 107 s | `inbox-keys` failed every run |

A run 20-40% slower risks the browser jobs' 5-minute limit, and tests that fail only while tracing make the gate flaky.

## Decision

- The run that decides a browser shard's verdict records no trace. When a test fails, Playwright still writes its `error-context.md` (the error, the call log and the page's ARIA snapshot) in `test-results/`.
- A failed shard then moves that folder to `test-results-first-run/` and runs only its failed tests again, with `--last-failed --trace on`, so every rerun test keeps its trace. The rerun changes no verdict (`continue-on-error`, and the job has already failed).
- The shard uploads both folders as `browser-test-results-<shard>`, kept 14 days. A passing shard uploads nothing. A shard cut off at its time limit skips the rerun and uploads what had failed by then.

## Consequences

A flaky failure may pass on the rerun. Its trace then shows a passing path to compare against the first run's error context, and not the failing one. Check, which merge-ticket waits on, runs no browser tests ([ADR 0114](0114-release-is-the-gate-on-the-newest-green-v1-commit.md)), so this change touches only Release.

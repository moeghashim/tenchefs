# Release runs the browser tests in 6 shards

2026-11-25 (mattpocock/cookout#715). The decision is the cookout chief of staff's, on the issue: make `lost-focus.browser.test.ts` fast, and balance the browser shards so each finishes well under 4 minutes, adding shards rather than loosening the 5-minute limit.

## Context

Release's 3 `browser` jobs took 3:57 to 4:50 of their 5 minutes on 4539519a, with about 2,800 s of test time between them. `lost-focus.browser.test.ts` (#705) added 124.5 s on CI, and the shard that ran it was cut off at its limit after printing `RESULT: PASS`. A shard's job takes about its test time over 3.85 (4 workers on 4 cores), plus 33 s of setup.

## Decision

- Release runs 6 `browser` jobs, `browser 1/6` to `browser 6/6`, split by recorded time as [ADR 0112](0112-browser-shards-split-by-recorded-time-and-tests-log-in-by-cookie.md) describes. Each gets about 460 s of test time, about 2:31 of its 5 minutes.
- `lost-focus.browser.test.ts` logs in straight to the page it tests and makes its claims as steps on 4 pages, where it made them in 10 tests with 3 reloads.

## Consequences

After its choose job a Release gate run starts 9 jobs at once (6 browser shards, pack smoke, the published client and e2e-docker), so beside a Check run's 8 it stays inside the 20 concurrent jobs. The coverage map is read from all 6 shards' `browser-coverage-map-*` artifacts, and the next run's split from all 6 `test-timings-browser-*` ones.

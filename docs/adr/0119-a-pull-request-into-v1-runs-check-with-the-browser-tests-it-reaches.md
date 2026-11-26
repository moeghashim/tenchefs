# A pull request into v1 runs Check with the browser tests it reaches

2026-11-25 (mattpocock/cookout#737). The decision is the cookout chief of staff's, on the issue: a pull request into v1 gets a check that runs what Release's gate would, inside the CI budget, using the same jobs as Check and Release rather than a copy.

## Context

Since [ADR 0114](0114-release-is-the-gate-on-the-newest-green-v1-commit.md), Check on v1 runs the static checks, the unit tests and coverage, and only Release runs the browser tests. [ADR 0105](0105-check-runs-8-jobs-only-on-v1-and-merge-ticket-branches.md) took Check off pull requests. A pull request merged on GitHub therefore ran no Check before it landed. On 2026-11-25 this let a slow browser test (#715), a relative-time browser test (#735), a coverage gap (#726) and an unformatted ADR (#729) reach v1, and each held back every deploy until Release ran.

## Decision

- Check runs on `pull_request` into v1, on GitHub's merge of the pull request with v1: `static`, `tests` ×6 and `coverage` as on a push, plus `browser` ×6.
- The browser shards are one reusable workflow, `.github/workflows/browser.yml`, which Release calls on its chosen commit and Check calls with `reached: true`. A `reached` shard runs `node scripts/check.ts --job=browser --reached`, which picks the browser tests the change since origin/v1 reaches as a local `pnpm check` does ([ADR 0096](0096-a-local-check-picks-browser-tests-from-ci-s-recorded-coverage.md)), from the coverage map Release recorded, and runs its share of them split by recorded time (`reachedBrowserShardPlan` in `scripts/lib/timed-shards.ts`). A shard with no share, and every shard of a docs-only change, passes without starting Playwright. It runs plain Playwright and uploads no timings or coverage map, since it ran only some of the tests.
- A pull request from a `merge-ticket-*` branch runs none of these jobs: its push run already checked the same merge.
- Every script that reads Check runs (`ci:wait`, `merge-ticket`, Release's choice, `budgets`) asks for `push` runs, so a `pull_request` run never stands in for one.
- Making the check required is a repository setting, which agents never change. Landing a pull request with `gh pr merge` waits for its Check run to be green first.

## Consequences

A pull request's Check run adds the browser shards' setup (about 33 s) to its wall time, and the reached tests' share; a view change that reaches a few files stays near the push run's 3 minutes. A change that reaches every browser test (a server file, the lockfile) runs all of them, about 2:40 per shard. A pull request's run of up to 14 jobs beside a Release gate run's 9 can pass the 20 concurrent jobs, and then jobs queue.

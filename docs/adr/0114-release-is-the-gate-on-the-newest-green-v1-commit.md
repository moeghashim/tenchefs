# Release is the gate, on the newest green v1 commit

2026-11-25 (mattpocock/cookout#636, spec #631 "v1's Check" and "Release, the gate"). Matt agreed on the board on 2026-11-25 (thread 5066, msgs 5094 and 5097, agreed in msgs 5093, 5096 and 5098) that the Release is the gate: only a commit that passed every check is published or deployed.

## Context

Check ran 8 jobs on every v1 push, browser ×3 among them, and the Release workflow ran on pushes to main: e2e-docker, pack smoke and the published client, then changesets. Deploy ran on the same push, with its own e2e-docker. So the browser tests ran on every landing, e2e-docker ran twice per deploy, and moving main was a manual step. The Version Packages pull request was based on main, so merging it (#498) put a commit on main that v1 lacked, and the next fast-forward of main refused until main was merged back into v1.

## Decision

- v1's Check runs 5 jobs: `static`, `tests` ×3 and `coverage`. The browser shards move to Release, with the same shards, timings and `--all`.
- Release runs by `workflow_dispatch` on v1 (starting it on its own is the next ticket). Its first job, `scripts/release-commit.ts`, picks the newest first-parent v1 commit whose Check push run is green, judged as `ci:wait` judges a commit: any completed run that succeeded makes it green, and a cancelled run never makes it red. It prints the commit, its run's URL, and why it skipped each newer commit (red, still running, all cancelled, or no run), and reuses that run's static checks and unit tests. The decision is `chooseReleaseCommit` in `scripts/lib/release-commit.ts`, behind the `gh` and `git` seams.
- On that commit the gate runs browser ×3, pack smoke, the published client and e2e-docker. The `gate` job names every one that didn't pass in the run summary and fails; nothing after it runs then.
- When the gate passes, `promote` fast-forwards main to the commit with a plain push. Then Release calls Deploy as a reusable workflow (`gated: true`, `ref: <sha>`), since a push made with the workflow's token starts no other workflow, and runs the changesets step as before. Deploy has no `push: main` trigger, keeps `workflow_dispatch`, and skips its own e2e-docker when called gated.
- The dry-run input runs the choice and the gate, then only prints what it would publish and deploy.
- The version bump is cut on v1: Release runs on v1, so changesets opens the Version Packages pull request from `changeset-release/v1` against v1. Merged, it lands like any change, and the next Release whose chosen commit has no changesets left publishes the version, as `changeset publish` publishes only a version npm lacks. If main still has commits the chosen commit lacks, the choice stops before the gate and names them (`mainAhead`, unit-tested).
- The browser coverage map is uploaded by Release's browser jobs under the same artifact names. Its commit is the chosen one, older than the Release run's own, so the local check reads the commit from the map, not from the run.

## Consequences

This supersedes [ADR 0088](0088-the-e2e-suite-runs-only-on-ci.md) and the Release and browser parts of [ADR 0105](0105-check-runs-8-jobs-only-on-v1-and-merge-ticket-branches.md). A green v1 Check no longer covers the browser tests: a break only they catch shows on the next Release, which then publishes and deploys nothing, and is a fix-forward ticket. The coverage map lags v1 by up to one Release, which the browser selection's staleness rule already handles. Moving main by hand deploys nothing any more.

Superseded in part on 2026-11-25 by [ADR 0116](0116-unit-test-shards-split-by-recorded-time-across-6-jobs.md): v1's Check runs 8 jobs, `tests` ×6 split by recorded time.

Superseded in part on 2026-11-25 by [ADR 0118](0118-release-runs-the-browser-tests-in-6-shards.md): the gate runs browser ×6.

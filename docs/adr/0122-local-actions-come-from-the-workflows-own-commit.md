# Local actions come from the workflow's own commit

2026-11-25 (mattpocock/cookout#748).

## Context

Release dry run 45691182262, dispatched on v1 at ca5b892a, failed in every browser shard with "Can't find 'action.yml' ... under .github/actions". Its workflow files came from ca5b892a, where `browser.yml` uses the new `./.github/actions/install-chromium`, but Check on ca5b892a was still running, so the choose job picked the newest green commit, 45eea45d, and the shards checked that out. A local action (`uses: ./.github/actions/<name>`) resolves from the checked-out tree, and 45eea45d had no install-chromium. A reusable workflow called with `./` comes from the workflow's commit, so the job's steps and its local actions came from two commits.

Release's workflow comes from the dispatched ref, or from main, the default branch, on `workflow_run`. Main moves only when Release ships (ADR 0114), so on `workflow_run` the workflow's commit is behind the chosen v1 commit by design. Releasing only when the chosen commit is the workflow's own would therefore stop every automatic run, so that option was rejected.

## Decision

- Every job that checks out a commit other than the workflow's own (an `actions/checkout` with a `ref` other than `${{ github.workflow_sha }}`) and then uses a local action has, right after the checkout, the step "Local actions from the workflow's commit". It replaces `.github/actions` with that directory at `github.workflow_sha`, fetching that commit first if the checkout didn't. The app, `scripts/` and the rest of the tree stay at the chosen commit. Such jobs are in `release.yml` and the reusable workflows it calls with the chosen commit, `browser.yml` and `deploy.yml`.
- The release job puts the chosen commit's `.github/actions` back after its setup, since `changesets/action` commits every change in the tree into the Version Packages pull request.
- `pnpm hygiene` (`scripts/lib/workflow-actions.ts`), in `pnpm check`'s drift job and v1's Check, refuses a workflow job that uses a local action after such a checkout without that step, naming the file, the job, the step and the ref.

## Consequences

A Release run uses the workflow's actions with the chosen commit's app, whichever commits they are: a ticket that adds or changes a composite action can't break the gate on an older green commit, and can't be broken by it. The step leaves `.github/actions` modified in the tree when the two commits differ there. When they are the same commit, as in a Check run, the step changes nothing. An action changed on v1 isn't used by an automatic Release run until main has it, as with every other part of the workflow.

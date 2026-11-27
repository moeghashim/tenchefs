# The tests budget is 90 s per shard

2026-11-26 (mattpocock/cookout#761, answering #749). Supersedes [ADR 0030](0030-time-budgets-warn-and-never-block.md)'s tests figure only.

## Context

ADR 0030 set the `tests` check's budget to 26 s, a budget for the whole suite run as one job. CI now runs the unit tests as six `tests` shards ([ADR 0105](0105-check-runs-8-jobs-only-on-v1-and-merge-ticket-branches.md)), and each shard takes about 80 s to 130 s (#751). The budget is one number on the `tests` check in `scripts/lib/check-plan.ts`, applied to whatever that check runs: a shard on CI (`--job=tests --shard=N/6`), the coverage job's merge, or a local run. So every shard went over 26 s on every run, and its warning told nobody anything.

## Decision

Matt, 2026-11-26, board msg 5913: "90s budget".

- The `tests` check's budget is 90 s. On CI that is per shard: a shard under 90 s shows no budget warning, and one over 90 s shows the `::warning::`.
- The same 90 s applies to a local run. A local `pnpm check` runs only the related unit tests (`vitest related`), which fit well inside it. A local `pnpm check --all` runs the whole suite as one job and will usually go over; one number can't serve both a sixth of the suite and all of it, and the per-shard figure is the one Matt chose.
- Budgets still only warn (ADR 0030). No other budget changes.

## Consequences

A shard's budget warning means something again: the 116 s and 130 s shards of #751 warn, the 83 s ones don't. A local `--all` run's tests warning is expected and can be ignored.

# Check runs 8 jobs, only on v1 and merge-ticket branches

2026-11-25 (mattpocock/cookout#605). Matt agreed on the board on 2026-11-25 (msgs 4906, 4909 and 4917): "agree with all this".

## Context

Each Check run had 20 jobs, and GitHub's free plan runs 20 jobs at once, so only one Check run ran at a time across the repository. About half of the last 60 runs were on workers' `ticket-*` branches, and each commit ran twice, once on `push` and once on `pull_request`. The `merge-ticket-*` runs, the only ones that gate anything, waited behind them: one took 14 minutes, against 4 with an empty queue.

## Decision

- Check runs on pushes to `v1` and `merge-ticket-*`, and on `workflow_dispatch`. It doesn't run on `pull_request` or on `ticket-*` pushes. A worker runs `pnpm check` before opening a pull request, and the merge-ticket run is the gate.
- `pnpm merge-ticket` reads no ticket-N Check run any more: it judges v1's latest run, then merge-ticket-N's.
- The 8 static checks (lint, canaries, types, fixers, seams, knip, format and drift) run as one `static` job, one step each, one after another on one runner. The job stops at the first that fails, and its failed step names it. Each step is the check's own `scripts/check.ts --job=`.
- The screenshots job is gone. Nothing read its output; `pnpm screenshots` stays a local tool.
- The e2e suite (`e2e-docker`), `published client` and `pack smoke` move to the Release workflow, whose `release` job needs all three before it opens the Version Packages pull request or publishes. Deploy still runs the e2e suite before it deploys main.
- Tests ×3, browser ×3 and coverage stay as they were. A Check run has 8 jobs, so 2 runs fit at once in the 20 concurrent jobs.

## Consequences

This revises [ADR 0088](0088-the-e2e-suite-runs-only-on-ci.md): the e2e suite, pack smoke and the published client no longer gate a landing on v1. A break only they catch shows on the next push to main, where Release won't publish and Deploy won't deploy, rather than before the merge. A ticket branch gets no CI signal until merge-ticket pushes its merge, so `pnpm ci:wait` on a `ticket-*` branch finds no run, and `pnpm check`'s "CI green at HEAD" skip never applies there.

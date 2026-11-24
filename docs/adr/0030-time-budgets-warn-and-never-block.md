# Time budgets warn and never block

2026-11-23 (mattpocock/cookout#81). Supersedes ADR 0013. The decision that budgets only warn is Matt's. Doubling every budget is the chief of staff's proposal, pending Matt's review.

## Context

Each check in `scripts/check.ts` has a time budget. Until now a check over its budget failed CI, after the re-time from ADR 0013. On v1, test shard 1 kept landing near its 13s budget. It took 10.3–12.8s on most push runs, and 13.1–18.1s on some first runs. Run 45147127963 at 33b6c40 failed on two slow runs (15.5s, then 16.4s) and blocked every merge into v1 until it was re-run. The pre-commit hook has its own budget of 2 seconds. That budget lives only in ticket criteria (for example #83), not in code.

## Decision

Matt, 2026-11-23: "I think our budget is a little bit too harsh. I also don't want the budget to fail the CI because I don't want to always block feature work against a slow CI. As in we can potentially defer it to later."

Matt, 2026-11-23, on the pre-commit hook: "Yeah, I think I want the precommit hooks one to be relaxed as well."

- A check over its budget never fails `pnpm check` or CI. It is reported as `SLOW` with its time and budget. In CI (`--ci`) it also prints a GitHub `::warning::` annotation naming the check, its time and its budget, and the run stays green. Locally it prints the same warning on stderr.
- A slow check is no longer timed a second time. ADR 0013's re-time only stopped noise from failing a run, and nothing fails on time now.
- Every CI budget doubles (proposal, pending Matt): lint 8→16s, canaries 9→18s, types 5→10s, fixers 8→16s, seams 4→8s, tests 13→26s, browser 15→30s, knip 5→10s, validators 5→10s, hygiene 3→6s, docs 3→6s, api 5→10s, exports 3→6s, format 3→6s.
- The pre-commit hook's budget doubles from 2s to 4s (proposal, pending Matt). Like the CI budgets, it is a target to warn about. A hook that takes longer still lets the commit through, and a ticket that measures the hook reports its time rather than failing on it.

## Why

A failing budget turns runner noise and slow drift into a blocked merge for whoever happens to be merging. The cost of a slow check is real but can wait. A warning keeps the drift visible on every run, and a speed ticket can deal with it when it is worth doing.

This departs from the target in the perfect-typescript-codebase skill, which treats a check over budget as a defect that fails the run. Here a check over budget is still a defect, but one that is reported, not one that blocks.

## Consequences

Nothing stops a check from getting slower. The `SLOW` lines and the CI annotations are the only signal, so someone has to read them. Measured leads for test shard 1 are in the #81 close comment.

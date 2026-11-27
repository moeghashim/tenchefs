# A worker lands its own pull request after its pull request's Check is green

2026-11-25 (mattpocock/cookout#634, spec #631, "Landing"). Matt decided on the board on 2026-11-25 (msgs 5093 to 5101; the steps in msgs 5092 and 5094). Supersedes [ADR 0104](0104-v1-moves-only-by-fast-forward-from-a-green-merge-ticket-branch.md), and the parts of [ADR 0105](0105-check-runs-8-jobs-only-on-v1-and-merge-ticket-branches.md) that make the merge-ticket run the gate.

Amended before landing, on 2026-11-26 (board msgs 5914 and 5918): when Matt decided, no Check ran on a pull request. Since mattpocock/cookout#737, every pull request into v1 gets its own Check run, on its merge with v1, with the browser tests it reaches. The cookout agent proposed (msg 5914) that a worker waits for that run to be green before it merges, since a red run would otherwise go straight into v1. Matt, 2026-11-26 (msg 5918): "Sounds good".

## Context

`pnpm merge-ticket` landed one ticket at a time: it merged ticket-N into a merge-ticket-N branch, waited for that branch's full Check run, and fast-forwarded v1 to it, merging again and waiting again whenever v1 moved. Every landing cost at least one full Check run, a busy v1 cost one per round, and only the chief of staff's queue ran it, so built tickets waited in line for hours. The worker had already run `pnpm check` on its branch, and v1's own push run checks every merge again.

## Decision

- **A worker lands its own pull request.** After its last commit and a passing `pnpm check`, it pushes, opens the pull request against v1 if it isn't open, runs `git fetch origin v1` and `git merge --no-edit origin/v1`, and with no conflict pushes, waits for the pull request's Check run to be green (`gh pr checks <PR> --watch --fail-fast`), and runs `gh pr merge <PR> --merge`. It never merges while a job is red or running: it fixes a red run and goes round again. It then closes the ticket's issue with the merge commit's SHA, and doesn't wait for v1's Check run. The steps are in AGENTS.md.
- **A clean merge of v1 runs no local checks.** It makes its commit without the pre-commit hook; the pull request's Check run checks the merge before it lands, and v1's push run covers the merged result. A conflict is resolved by rules (rerun a generated file's generator; in a migrations list keep v1's entries first; in coverage thresholds keep the lower number), committed with `scripts/commit.sh`, and checked again with `pnpm check` before merging v1 again.
- **A red v1 is fixed forward.** The fix-forward ticket goes first and lands by the same steps; there is no `--fixes-red-v1`.
- **merge-ticket goes.** Its script, libraries and tests, the `merge-ticket-*` trigger in the Check workflow and `ci:wait`'s vouching by a green `merge-ticket-*` run on the same commit are gone, with its base-was-red hint and its rerun of a red run's failed jobs, which only merge-ticket used. Check runs on pushes to v1, on pull requests into v1 and on `workflow_dispatch`. `pnpm ci:wait` stays, for watching v1.
- **No guard is lost.** The lint-config guard already runs in `pnpm check` ([ADR 0109](0109-the-lint-config-guard-runs-in-the-check-and-approval-is-a-commit-trailer.md)). merge-ticket's migrations guard moves into `pnpm check`'s hygiene step: the list must begin with v1's at the merge base with origin/v1 (after a merge of v1, origin/v1's own), as well as with the newest `deploy/*` tag's. Hygiene already refuses an ADR number taken twice, so a clash merge-ticket renumbered is now renumbered by hand.

## Consequences

- A landing costs one pull request Check run, which a worker waits for. A bad combination of two tickets that land close together still shows up only on v1's push run after they land, and is fixed forward.
- v1's history holds GitHub's merge commit for each pull request, whose second parent is the ticket branch (with its own merge of v1).
- If a repository setting ever stops `gh pr merge --merge` into v1, a worker doesn't change it: it says so in its pull request, for Matt.

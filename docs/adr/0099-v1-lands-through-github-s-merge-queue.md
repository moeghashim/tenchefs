# v1 lands through GitHub's merge queue

Superseded on 2026-11-25 by [ADR 0104](0104-v1-moves-only-by-fast-forward-from-a-green-merge-ticket-branch.md): a merge queue isn't available on a user-owned repository, so v1 moves only by fast-forward from a green merge-ticket-N.

2026-11-25 (mattpocock/cookout#522). Matt decided on the board on 2026-11-25 (thread 4334, msg 4340, "4 yes") to turn on GitHub's merge queue for v1, so a landing doesn't lose its green CI when v1 moves. Agents write the code; Matt turns the queue on by hand, with the ruleset in #522. Agents never change repo settings.

## Context

`pnpm merge-ticket <N>` built `merge-ticket-N` on origin/v1, waited for its Check run, then pushed v1 itself. If v1 moved meanwhile, the push was refused, and merge-ticket merged the new v1 into `merge-ticket-N` and waited for a fresh Check run, up to 5 attempts, with a docs-only shortcut that skipped the run. Every refused push threw a green run away: on 2026-11-24 one ticket lost three green runs this way.

## Decision

- **merge-ticket enqueues instead of pushing v1.** Everything before the push stays: the v1-green and ticket-green gates, merging into `merge-ticket-N`, migrations, ADR renumbering, install and the fast checks. Then it pushes `merge-ticket-N`, opens (or reuses) a pull request `merge-ticket-N` → `v1` titled `Merge ticket-N: <title> (#N)`, enqueues it (`gh pr merge <pr> --merge --auto`), and waits for the queue's `merge_group` Check run through `scripts/lib/ci-gate.ts`, then for the pull request to merge. Merged means success, and it prints v1's new SHA. The code is `scripts/lib/merge-queue.ts`.
- **No "v1 moved" retry and no docs-only fast-forward.** The queue tests against the v1 it will land on. A conflict with a moved v1 shows up as a dequeue, named with GitHub's reason; `pnpm merge-ticket <N> --continue` then merges the moved v1 into `merge-ticket-N` as before.
- **A red queue run is reported the way `ci:wait` reports a red job** (#502): each failing test's file, name and first assertion lines, the log tail and the run's URL, then `Nothing was merged.` and the advice to fix it on `merge-ticket-N` and rerun with `--continue`. Its failed jobs are rerun once; if the rerun goes green, the pull request is enqueued again, and the new entry's run is the gate.
- **Until the queue is on, merge-ticket merges the pull request directly**, after `merge-ticket-N`'s own green Check run, as nothing else would gate it. It reads whether v1 requires the queue from `gh api repos/{owner}/{repo}/rules/branches/v1`; once it does, the queue's run is the gate and merge-ticket doesn't wait for `merge-ticket-N`'s push run.
- **Each attempt pushes a fresh branch, never forced.** The local branch is still `merge-ticket-N`, but each attempt pushes it to `merge-ticket-N-<first 12 hex of its SHA>` with a plain push, deletes any earlier attempt's branch (closing its pull request), and opens the pull request from the new one. A fixed commit on `--continue` is a new branch, so no push ever overwrites a ref.
- **One required check, `checked`.** `check.yml` runs on `merge_group`, and its last job, `checked`, needs every other job and fails if any failed or was cancelled. The ruleset requires `checked` alone, so adding a job or a shard never changes it.
- **The merge method is `MERGE`** (proposed in #522, set by Matt's ruleset), with the repository's merge commit title set to the pull request title. v1's first-parent history stays one `Merge ticket-N: … (#N)` commit per ticket, whose second parent is `merge-ticket-N`'s own merge of ticket-N. `SQUASH` would drop ticket-N's commits from v1's ancestry, and `REBASE` refuses merge commits.
- **v1's push run of a queued commit still runs.** The queue lands the exact commit its `merge_group` run tested, so v1's push run is that commit's second run. Rather than skip it, the vouch in `scripts/lib/ci-vouch.ts` counts a green `merge_group` run on the same SHA, as it counts a green `merge-ticket-*` push run, so the next merge-ticket's v1 gate needn't wait for v1's own run. Keeping it means every v1 commit still has a push run of its own, as before, and skipping it would need `check.yml` to look up another run before it starts.

## Consequences

- After Matt's step, a direct push to v1 is refused, and every landing goes through a pull request and the queue.
- v1 gains one merge commit per ticket on top of `merge-ticket-N`'s: the readers of v1's history (`asOneTicketMerge`, the hygiene check of each ADR's first commit, the `deploy/*` tag comparison in the migrations base) read ancestry or `merge-ticket-N` itself, so the extra parent changes none of them.
- The queue merges textually: two tickets that each add ADR 0100, or a migration, can both land cleanly in git. The queue's Check run (hygiene's ADR and migration guards) is what refuses the second, as a red run, and `--continue` renumbers after merging the moved v1.
- Undo by deleting the ruleset (`gh api -X DELETE repos/mattpocock/cookout/rulesets/<id>`): merge-ticket then merges directly again after `merge-ticket-N`'s green run.

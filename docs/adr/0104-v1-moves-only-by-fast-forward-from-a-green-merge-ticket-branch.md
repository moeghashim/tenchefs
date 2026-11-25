# v1 moves only by fast-forward from a green merge-ticket-N

2026-11-25 (mattpocock/cookout#567). Supersedes [ADR 0099](0099-v1-lands-through-github-s-merge-queue.md). Matt approved landing by fast-forward push again on the board on 2026-11-25 (msg 4631).

## Context

ADR 0099 had `pnpm merge-ticket` enqueue merge-ticket-N's pull request in GitHub's merge queue, and merge it directly with `gh pr merge` until v1 required the queue. On 2026-11-25 Matt ran #522's ruleset step, and GitHub refused it with `Validation Failed: Invalid rule 'merge_queue'`: merge queues are only available on repositories owned by an organization, and `mattpocock/cookout` is owned by a user. So the queue can never be the gate here. Meanwhile the direct path made a new merge commit on v1: if v1 had moved after merge-ticket-N's Check run, that commit was a combination nobody tested (#534 landed this way). Its `gh pr view --json isInMergeQueue` also asked for a field GitHub doesn't serve, so a landing that had merged could still end `RESULT: FAIL`.

## Decision

- **v1 moves only by a fast-forward push of merge-ticket-N's green commit.** merge-ticket pushes merge-ticket-N to `merge-ticket-N-<first 12 hex of its SHA>` (as in ADR 0099, never forced), waits for that branch's Check run on that exact SHA, and only when it is green runs `git push origin <sha>:refs/heads/v1`, a plain push with no force. v1 then holds exactly the commit CI checked, with no merge commit of GitHub's on top.
- **A refused push means v1 moved: merge again and wait again.** merge-ticket fetches; if origin/v1 is no longer an ancestor of the commit, it merges the new origin/v1 into merge-ticket-N (through the same lint guard, migrations guard, ADR renumbering and fast checks as the first merge), pushes the new commit's branch, waits for its Check run, and pushes again, printing each round, up to 5 rounds. If origin/v1 is still an ancestor, the push failed for another reason, and it stops with git's output.
- **The pull request stays, for review and links.** merge-ticket still opens (or reuses) a pull request from the pushed branch into v1, titled `Merge ticket-N: <title> (#N)`, before it waits for CI. It never asks GitHub to merge it: GitHub marks it merged when its head reaches v1.
- **No queue code.** The `merge_group` trigger and run lookups, the `checked` job, `gh pr merge`, and the `isInMergeQueue`/`autoMergeRequest` reads are gone. `scripts/lib/merge-pull-request.ts` only opens or reuses the pull request.
- **No docs-only shortcut.** A moved v1 always gets a fresh Check run, even when merge-ticket-N touches only docs, so v1 never holds an unchecked commit.

## Consequences

- v1's first-parent history is again one merge-ticket-N merge commit per ticket, whose second parent is ticket-N; readers that looked for it as `v1^2` (the queue's merge) now find it at v1.
- A busy v1 can cost a green run per round, the problem ADR 0099 set out to fix. That cost stays until the repository can use a merge queue (an organization-owned repository), which would need a new ADR.
- `check.yml` has no `merge_group` trigger and no `checked` job any more, and `scripts/lib/ci-vouch.ts` counts only a green `merge-ticket-*` push run as vouching for v1's commit: on this repository a `merge_group` run never happens, and nothing required the `checked` check (v1 has no ruleset and no branch protection on 2026-11-25).

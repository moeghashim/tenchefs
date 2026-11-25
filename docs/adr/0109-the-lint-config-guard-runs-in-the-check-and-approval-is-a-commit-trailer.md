# The lint-config guard runs in the check, and approval is a commit trailer

2026-11-25 (mattpocock/cookout#632, spec #631, from board thread 5066). Moves the lint-config guard out of merge-ticket, so that it still holds once landing no longer goes through merge-ticket.

## Decision

- **The guard is a drift check.** `scripts/lint-config.ts` (`pnpm lint-config`) runs in `pnpm check`'s drift job. It refuses a change that loosens the lint config, by the same rules merge-ticket used: in `.oxlintrc.json` a rule turned off or downgraded, an added or widened override, an added ignorePatterns entry, or anything it can't tell tightens; an added entry in `docs/lint-opt-outs.md`; any change to `.dependency-cruiser.cjs`. It names the file and the hunk.
- **Which range it judges.** Locally, HEAD against its merge base with `origin/v1`. On v1's Check, the push's range: the static job passes the drift job the same `--base` (the push's `before` SHA, or `HEAD^`) that lint's baseline ratchet already uses. It judges commits, not the working tree, since only a commit can carry the approval.
- **Approval is the trailer `Lint-approved-by: board msg <id>` on the commit that makes the loosening.** A file's loosening passes when a non-merge commit in the range that changes that file carries the trailer naming a board message. The range's net diff is judged, so a loosening undone later in the same range needs no approval. A trailer on a commit that doesn't touch the file approves nothing.
- **merge-ticket calls the same guard** (`scripts/lib/lint-config-guard.ts`) on ticket-N until it's removed, and keeps `--approved`, which still writes the trailer on its merge commit.

## Considered options

- **Judging each commit on its own diff**: rejected. A merge of v1 into a ticket would carry v1's approved loosenings with no trailer of its own, and a loosening undone later in the branch would still fail.
- **A trailer anywhere in the range**: rejected, since it would let one approval cover a loosening it never named.

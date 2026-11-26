# Release moves main for a commit with nothing user-facing

2026-11-25 (mattpocock/cookout#753).

## Context

An automatic Release run (`workflow_run`, when Check completes on v1) runs the default branch's workflow files, main's, not v1's. Main moved only when Release deployed, and Release skipped a commit with nothing user-facing since the newest `deploy/*` tag. Runs 45692690646 and 45693613755 chose de980c80 and 73e3108a and both printed `skipped: nothing user-facing since deploy/46c3ad4b`, so main stayed at 46c3ad4b and every automatic run kept running 46c3ad4b's `release.yml`, without #744's wait for the gate spacing, #748's local actions from the workflow's commit or #742's browser cache. A fix to Release touches only CI files, which are never user-facing, so it never took effect for automatic runs until something user-facing landed; if Release itself broke, only a hand dispatch on v1 could carry the fix.

## Decision

- When the chosen commit (the newest v1 commit whose Check push run is green) has nothing user-facing since the newest `deploy/*` tag and main lacks it, the choose job prints `moves main: nothing user-facing since deploy/<sha>, so main takes <sha>'s workflows without the gate or a deploy` and outputs `go=false` and `promote=true` (`scripts/lib/release-go.ts`). The gate jobs, Deploy and changesets are skipped; only `move main` runs, fast-forwarding main to the commit with the same plain push. When main already has it, it prints `skipped: nothing user-facing since deploy/<sha>, and main already has <sha>` and moves nothing.
- Such a run doesn't wait for the 30-minute gate spacing: it runs no gate. Its browser jobs are skipped, so it doesn't count as a gate run for the next one.
- A run that goes ahead (`go=true`) moves main only after the gate passes, as before.

## How it fits ADR 0114

ADR 0114 says Release alone moves main, by fast-forward to a green v1 commit, and that main moves when the gate passes. That still holds: `move main` stays the only writer of main, the push is still a fast-forward the choose job checked, and the commit is still one whose Check push run is green. What changes is that the gate (browser ×6, pack smoke, the published client, e2e-docker) is required only for a commit that ships something. A commit with nothing user-facing changes nothing that is deployed or published, so the gate would test the same app the newest `deploy/*` tag already deployed; its green Check run is the check it gets. Main is therefore no longer always the deployed commit: it can be ahead of the newest `deploy/*` tag by commits with nothing user-facing, and the tag, not main, says what is live.

## Consequences

A change to Release, Check or any workflow takes effect for automatic runs on the first Release after it lands green on v1. Main may sit ahead of the deployed commit, by CI, docs, test and `scripts/` changes only. Merging into v1 is unchanged, since main still only fast-forwards to v1 commits.

# Release publishes a version npm doesn't have, even with changesets pending

2026-11-27 (mattpocock/cookout#936).

## Context

Release's publish step ran only when `changesets/action` reported no pending changesets (`hasChangesets == 'false'`), on the reasoning that a merged Version Packages pull request leaves none (docs/adr/0114). On 2026-11-27 Version Packages #924 (0.11.0) merged into v1 as 6bae1db3, but the Release runs it started were cancelled by newer pushes. #925 then landed as 672e51fc with its own changeset, and the surviving run (46000140301) chose 672e51fc: `package.json` said 0.11.0, which npm didn't have, but `.changeset/` held #925's changeset. The action opened Version Packages #932 (0.12.0) and the publish was skipped, so 0.11.0 never shipped. With several workers landing at once, a changeset landing in that window is the usual case, so a version could be put off again and again.

## Decision

- **Publishing is keyed on the chosen commit's version being unpublished**, not on there being no pending changesets. `scripts/release-publish.ts` (`releasePlan` in `scripts/lib/release-publish.ts`) asks npm for exactly `@ai-hero/cookout@<version>`; when npm doesn't have it, the release job runs `pnpm release` on the chosen commit. A 404 counts as unpublished; any other npm failure fails the step rather than guess.
- **Both happen in the same run**: after publishing, `changesets/action` opens or updates Version Packages for the pending changesets as before.
- **The publish runs before the action.** The action leaves the tree on `changeset-release/v1` with the next version, so publishing after it would ship the wrong tree.
- **Only CI publishes**: the decision says publish only under GitHub Actions, and the workflow's publish step is the only place that runs `pnpm release`. `changeset publish` still skips a version npm already has.

## Considered options

- **Keep the `hasChangesets` condition and stop new changesets landing until the version ships.** Rejected: it blocks every worker on Release.
- **Publish inside the action (`publish:` input).** Rejected: the action runs `publish` only when no changesets are pending, the very condition that failed.

## Consequences

- A Version Packages merge whose own Release runs are cancelled is still published by the next Release run that goes ahead.
- The dry run reports the publish and the Version Packages pull request separately, and checks npm for the exact version rather than trusting `npm view`'s exit code, which is 0 for a missing version of an existing package.

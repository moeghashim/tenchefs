# Release counts unreleased work from the newest Version Packages merge

2026-11-27 (mattpocock/cookout#895).

## Context

Before changesets runs, Release adds a patch changeset when shipping code landed since the last version with none (`scripts/release-changeset.ts`, #648). Two things made it add one when nothing had shipped, so every Release opened another Version Packages pull request (#890) instead of publishing 0.9.0:

- It took the last commit whose diff touched package.json's `"version":` line as the base. #875, a Version Packages merge, left the version unchanged because v1 was already 0.9.0, so the base stayed at the older 9f8b9b5a and everything #875 merged was counted again on every run.
- It counted `app/modules/testing/` as shipping. That module is the shared test utilities, which only tests may import (the dependency-cruiser seam rules), so it ships nothing.

## Decision

- **The base is the newest Version Packages merge** on HEAD's first-parent line: the newest commit whose subject is `Version Packages` or `Version Packages (#N)`, the subjects changesets/action's commit and its pull request's merge get. It counts even when it left the version unchanged. With no such commit, the base is the last commit that changed package.json's version, as before, and with neither, the first commit.
- **`app/modules/testing/` is not user-facing**, beside `scripts/`, `.github/`, `tests/` folders, test files and docs (`isUserFacing` in `scripts/lib/release-go.ts`), for both the go decision and the changeset.

## Considered options

- **The published version's release tag as the base.** Rejected: Release tags deploys (`deploy/*`), not versions, so there is no such tag to rely on.

## Consequences

- A Version Packages pull request merged with a different subject isn't found, and the base falls back to the version change, as it did before.
- A range with only test-only work after a Version Packages merge adds no changeset, so Release publishes the version npm lacks.

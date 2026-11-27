# Release versions the chosen commit, not the triggering one

2026-11-27 (mattpocock/cookout#920).

## Context

Release runs when Check completes on v1, and its choose job picks the newest green v1 commit (`scripts/release-commit.ts`), which can be newer than the commit whose Check triggered the run. Every job checks out the chosen commit. But `changesets/action`, on its "pending changesets" path, checks out `changeset-release/v1` and resets it to `github.sha`, the triggering commit, before it runs the `version` command. On 2026-11-27 Release run 45988356176 chose f795945b (#879) while triggered by c8c95683 (#895): the action saw #879's `.changeset/login-approve.md` on the chosen tree, reset to c8c95683, which lacks it, and `changeset version` failed with "No unreleased changesets found."

## Decision

The action's `version` input is `node scripts/release-version.ts <chosen SHA>`. That script resets the branch the action prepared to the chosen commit, then runs `pnpm run version` (`versionOnChosen` in `scripts/lib/release-version.ts`). The action then commits and force-pushes `changeset-release/v1` on top of the chosen commit. The patch changeset `scripts/release-changeset.ts` adds before the action is untracked, so it survives both resets.

## Considered options

- **Set `GITHUB_SHA` to the chosen commit in the step's `env`.** Rejected: for a JavaScript action the runner sets every `GITHUB_*` variable from the `github` context after the step's env (`NodeScriptActionHandler` in actions/runner), so the override never reaches `@actions/github`'s `context.sha`.
- **Run the step from a ref whose `github.sha` is the chosen commit**, such as a dispatched run on it. Rejected: a second run per release, and the action has no input for the commit.

## Consequences

- The action reads the package versions for its pull request body after its own reset, on the triggering commit. When a Version Packages merge lies between the triggering and the chosen commit, that body can name a version the chosen commit already has; the pull request's diff is still right.
- When the chosen commit is the triggering one, the extra reset changes nothing.

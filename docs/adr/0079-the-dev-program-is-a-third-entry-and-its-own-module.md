# The dev program is a third entry and its own module

2026-11-24 (mattpocock/cookout#345). Merges and replaces `0017-a-dev-program-entry-runs-the-local-cookout` and `0020-the-dev-program-is-its-own-tested-module` (2026-11-22, mattpocock/cookout#29 and #31), which git history keeps. Both were chief-of-staff choices, pending Matt's review.

`pnpm dev` starts `cookout serve` on a temporary SQLite file with the webhook fake, and `pnpm seed` fills it with a small board. The fake is an Effect Layer, so only a program entry can start it, and a `dev` verb in the `cookout` binary would make the published binary reach test code (`published-entries-ship-no-test-code`).

## Decision

- **A third program entry, `app/dev.ts`**, with the same lint and seam status as `app/main.ts`. It is never built or published: tsdown and the package's `bin` and `exports` don't name it.
- **Its commands are the `dev` module** (`devCommandLine`: `start` and `seed`), which only `app/dev.ts`, `testing` and tests may import (`dev-only-from-the-dev-entry`) and no published entry may reach. `dev` is on `TESTED_INTERFACES`, and its tests drive the commands in process, as `pnpm dev` and `pnpm seed` do.
- **The seed goes through the SDK** as an admin would, so it needs no access to storage.

## Considered options

- **A `dev` verb in `cookout`**: rejected, because the published binary must not reach the webhook fake.
- **The commands in `testing`**: rejected, because their tests then passed the `TESTED_INTERFACES` allowlist as SDK tests, though they test the dev program.

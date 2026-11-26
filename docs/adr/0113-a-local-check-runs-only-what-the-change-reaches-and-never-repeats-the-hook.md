# A local check runs only what the change reaches, and never repeats the pre-commit hook

2026-11-25 (mattpocock/cookout#633, spec #631 "The local check"). Matt decided on the board on 2026-11-25 (msgs 5100 to 5103) that `scripts/check.ts` decides what a local `pnpm check` runs from the change since `origin/v1`, not the agent, and that `--all` runs everything.

## Decision

- A local `pnpm check` (no `--all`, no `--job`, no `--ci`) runs knip, the drift checks (validators, hygiene, docs, api, exports, render), fixers and canaries, plus:
  - the unit tests whose import graph reaches a changed file: `vitest related --run` over the changed files that aren't docs (`pnpm test:related`), without `--coverage`, so without the repo-wide coverage thresholds;
  - the browser tests [ADR 0092](0092-local-check-runs-only-the-browser-tests-a-branch-reaches.md) and [ADR 0096](0096-a-local-check-picks-browser-tests-from-ci-s-recorded-coverage.md)'s selection picks, unchanged.
- It doesn't run lint, format, types or seams: the pre-commit hook (`lefthook.yml`) ran them on every commit. Before its verdict it prints `skipped: lint, format, types and seams, the pre-commit hook's, …`, and a `skipped:` line for the unit tests and one for the browser tests it didn't select.
- One list in `scripts/lib/test-selection.ts` holds the files whose change reaches every test: the root configs (`package.json`, `pnpm-workspace.yaml`, the `tsconfig`s, `vitest.config.ts`, `vite.config.ts`, `playwright.config.ts`, `tsdown.config.ts` and the lint, format, knip, seams and hook configs), the lockfile, the testing module (`app/modules/testing/`), and the test environments, test servers and test containers under `scripts/`. The unit and the browser selection both read it. A change to one runs every unit and every browser test, with one stderr line naming the file: `check: running every unit and browser test, since pnpm-lock.yaml reaches every test.`
- A docs-only change (`*.md`, `docs/`, `.changeset/`) reaches no tests, so it runs neither tests nor browser tests. This replaces the separate docs-only skip (`scripts/lib/docs-only.ts` is gone).
- `--all` runs every check and every test, and never takes the "CI green at HEAD" skip. Every `scripts/check.ts` call in `.github/workflows/` passes `--all`. `--job`, `--shard`, `--ci`, the machine lock, the load line and the verdict line are as they were.
- `scripts/lib/check-plan.ts` holds the plan (which checks run, which are named as skipped), so it is tested over a given selection.

## Why

A worker's `pnpm check` ran lint, types, seams and format again after the hook had just run them on the same commits, and ran every unit test with coverage on, against a 2-minute budget. A worker also chose for itself when to run less. Selecting in the script from the change makes the local run short and the same for every worker, and CI still runs everything before v1 moves.

## Consequences

A green local `pnpm check` promises less than before: lint and types are as good as the hook's last run, unit tests the change doesn't import aren't run, and coverage thresholds aren't checked. The merge-ticket Check run runs everything with `--all` and is the gate. `pnpm check --all` runs it all here on purpose; `pnpm coverage:changed` still checks coverage of the changed files.

A lint config change runs every test locally but doesn't lint every file, since the hook lints only staged files; CI's `static` job does.

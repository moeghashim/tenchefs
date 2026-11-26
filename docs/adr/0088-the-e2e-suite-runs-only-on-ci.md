# The e2e suite runs only on CI

Superseded on 2026-11-25 by [ADR 0114](0114-release-is-the-gate-on-the-newest-green-v1-commit.md): the e2e suite runs in the Release gate on the newest green v1 commit, and Deploy no longer runs it again after the gate.

2026-11-24 (mattpocock/cookout#412). Matt decided on the board on 2026-11-24 (thread 3416, msgs 3439 and 3441) to keep local resources free by running the e2e suite only on CI: "I do still want it to do browser checking locally, but just not with the e2e suite".

## Context

Until now `AGENTS.md` said `pnpm check` "runs every check, as CI does", and agents read that as: a green local check means a green CI run. On 2026-11-24 many ticket agents ran on one 10-core machine at once, with load averages well above 10, and every heavy local run slowed the rest.

"The e2e suite" here is `packages/e2e`: its Vitest cases (`packages/e2e/app/**/*.test.ts`) and its Playwright cases (`packages/e2e/app/modules/cookout/tests/browser/*.browser.test.ts`, such as the person test), which drive a real served cookout through the SDK, the built `cookout` bin and headless Chromium. `pnpm e2e:docker` (`scripts/e2e-docker.sh`) builds the Docker image and the example handler's image, and runs that suite against the image twice, once on SQLite and once beside a throwaway Postgres container. CI runs it as `check.yml`'s `e2e-docker` job, not through `scripts/check.ts`, so `pnpm check` never ran it: before this change the skip was real but silent.

It is not the browser tests in `app/modules/routes/tests/browser` (root `playwright.config.ts`, `pnpm browser`), which run against a dev cookout and stay in `pnpm check` as its `browser` check.

## Decision

- `pnpm check` keeps running lint, canaries, types, fixers, seams, the Vitest projects (server, Postgres, S3, web), the browser tests, knip, the drift checks and format. It doesn't run the e2e suite.
- A full local run prints one line before its verdict naming the skip, the CI job that runs it and how to run it on purpose: `skipped: the e2e suite (packages/e2e on the Docker image), which CI runs as its e2e-docker job. Run it here on purpose with pnpm e2e:docker.` CI runs (`--ci`) and single-job runs (`--job=…`) don't print it. `scripts/check.ts` lists the CI-only suites; the line comes from `runChecks` in `scripts/lib/check-runner.ts`.
- `pnpm e2e:docker` is the way to run it locally on purpose. No second alias was added.
- CI runs exactly what it ran before. `pnpm merge-ticket` still waits for every job, `e2e-docker` included, before it fast-forwards v1.

## Why

The e2e suite is the heaviest thing a check could run: two image builds and two containerised cookouts with a full Vitest and Playwright pass against each. Run by every agent before every push, it would compete for the CPU and Docker with every other agent's tests. CI runs it anyway on every ticket and merge push, and merge-ticket won't merge without it, so running it locally too buys an earlier signal at a high shared cost.

## Consequences

This departs from "CI runs exactly the local check script": a green `pnpm check` no longer promises a green CI run. CI still guarantees, before anything lands on v1, that the image builds and the e2e suite passes against it on both stores. A break that only the e2e suite catches now shows in `pnpm ci:wait` after the push, not before it. Pack smoke and the published-client check are also CI-only jobs outside `scripts/check.ts`, as they already were; this decision doesn't change them.

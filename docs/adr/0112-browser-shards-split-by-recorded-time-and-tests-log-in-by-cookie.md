# Browser shards split by recorded time, and browser tests log in by cookie

2026-11-25 (mattpocock/cookout#619). Matt chose it on the board on 2026-11-25 (msgs 5014 and 5015): "Let's do 1 and 3."

## Context

Check run 45600205397 had 59 browser test files, 200 tests and 866 s of test time. Its three browser shards took 136, 177 and 146 s, since Playwright's `--shard` splits by test count, not time. The median test took 4 s, most of it a login through the form. A CI runner has 4 cores, and Playwright ran 2 workers, its default of half the cores.

## Decision

- Playwright runs 4 workers on CI (`CI=true`), and its default, half the cores, elsewhere.
- Each CI browser shard runs the files that give it its share of the test time the newest earlier Check run recorded in its `test-timings-browser-*` artifacts: the slowest file first, each to the shard with the least time so far, a file with no recorded time counting as the average file (`scripts/lib/browser-shards.ts`). Only artifacts uploaded before the asking run was created count, so all three shards, and any rerun of one, read the same timings and run every file once. With no timings to read, the shard falls back to Playwright's `--shard`. The shard's first line says which it did.
- A browser test logs in with `logIn` from `app/modules/routes/tests/browser/login.ts`: `POST /v1/session`, the call the login form makes, sent through the page's own request context so the cookie lands in its browser context, then the page opens already logged in. Only `login.browser.test.ts` and the landing tests, whose subject is login, type the token into the form (`logInThroughForm`).

## Consequences

The browser job reads the Actions API, so it has `actions: read` and `GH_TOKEN`. A shard's split is only as even as the last recorded run; a new file costs the average until a run records it.

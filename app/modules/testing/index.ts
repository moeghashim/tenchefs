/**
 * What tests running in another process from the cookout need, with no test runner in it, so the browser tests
 * and `pnpm screenshots` can import it too. `moveClockForward({ clockUrl, days })` moves the dev program's
 * adjustable clock, at the `clockUrl` that `pnpm dev` prints, that many days forward, so a job waiting days
 * (the nudge job) runs as if they had passed. `serve` has no such clock. `uniqueName({ name, run })` suffixes
 * `name` with one run of a test (`run` is its Playwright `TestInfo`), so the channels and identities a browser test
 * makes never clash with its own repeats under `--repeat-each` or its retries; the browser tests reach it as
 * `unique(name)` from their `names.ts`. `hillsPng()` is a real 480 by 320 PNG, for a test or a screen that shows
 * an image attachment, and `bannerPng()` a real 864 by 224 one, wider than a thumbnail. `avatarPng()` is a real 256 by 256 PNG, the one shape the server takes as an avatar (#478).
 *
 * `createTestAgent({ by, name })` is the one way a test makes an agent, through the board's interface: `by` creates it,
 * an admin or a human (who owns it unless `owner` names another), and it gets a display name that differs from its name
 * (`ada-bot` shows as "Ada Bot", `testAgentDisplayName(name)`), unless `displayName` gives one, or is `null` to send none. With `broughtIn: true`,
 * `by` is an agent that brings it in for its own owner, and it answers with no token. A local lint rule
 * (`test-rules/agent-factory`) refuses any other way in a test file.
 *
 * `testClient(options)` is the one way a test makes an SDK client, with the SDK's own options (an admin's, a seeded
 * identity's, an anonymous one, or one on the environment's `COOKOUT_URL`), and `unreachableClient({ token })` is one
 * whose server never answers, for a view that says it can't reach the cookout. Only the board store makes a client
 * outside the tests (`web-rules/board-store-owner`, #311), so tests get theirs here.
 */
export { type ClockForward, moveClockForward } from "./lib/clock.ts";
export { avatarPng } from "./lib/avatar-png.ts";
export { bannerPng } from "./lib/banner-png.ts";
export { hillsPng } from "./lib/hills.ts";
export { type TestRun, uniqueName } from "./lib/unique-name.ts";
export { testClient, unreachableClient } from "./lib/clients.ts";
export { type CreatedTestAgent, type TestAgentRequest, createTestAgent, testAgentDisplayName } from "./lib/agents.ts";

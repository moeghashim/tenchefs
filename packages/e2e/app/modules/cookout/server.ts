/**
 * The cookout under test: a running server at `COOKOUT_E2E_URL`, driven as a
 * caller drives it, through `@ai-hero/cookout/sdk` and the built `cookout`
 * bin run as its own process, never through the app's `testing` module. Each
 * `cookoutUnderTest` Layer is one run: it draws a fresh prefix for the names
 * it makes and, when it closes, passing or failing, deletes the run's channels (and their messages) and then its
 * identities, agents before their owners; one the server still refuses to delete is deactivated.
 * The admin it runs as is a real person on the deployed cookout, so nothing the run does reaches their Inbox: the
 * admin unsubscribes from each channel it creates, and every agent belongs to the run's own human, `owner`
 * (`<prefix>-owner`, made on first use), so offline alerts go there.
 * `runPrefix` is that prefix: `e2e-` (`e2eNameStart`) then the run's own eight characters. Deploy's
 * leftover checks count only names that start with `e2e-`, so a real identity made mid-run isn't one.
 * `deactivateIdentity` deactivates one of the run's identities and dies on any other name
 * (`requireRunIdentity`), so a test running as the deployed admin can't deactivate a real one (#191).
 * Vitest's `globalSetup` (`lib/server/leftover-channels.ts`) deletes every channel whose name starts
 * with `e2e-` before and after the suite, so a crashed run's leftovers go too.
 * `openRelay` opens a relay on 127.0.0.1 in front of any cookout URL, the deployed
 * one too, so a test can drop the connections of the `cookout` processes it
 * runs through it and refuse their reconnects with 502 for a while, and see
 * the status of every answer it relayed. `joinAgent` gives a `Session`: a new
 * agent of the run that has run `cookout join` in a state folder of its own,
 * optionally through a relay, and posts with `post`. `watchLine` and
 * `watchOutput` are the `cookout watch` stdout format.
 * `browserFixtures` is a `cookout` fixture for Playwright's `test.extend`: one
 * run for each browser test, closed when it ends, and its page logged in by
 * token on request. `exampleWebhookCommand` is the Webhook command the example handler
 * (`packages/handler-example`) holds the secret of. A handler learns its
 * Webhook command's secret only when the Webhook command is added or its secret rotated, so the suite can't add a
 * fresh Webhook command per run and still have the handler sign its calls:
 * `pnpm e2e:docker` adds it on the local container before it starts the
 * handler there, and `scripts/handler-provision.sh` on the deployed one. Its
 * schema needs a string `branch`. `requireExampleWebhookCommand` fails, naming the
 * missing Webhook command, when the cookout under test doesn't have it, so a webhook
 * test fails there instead of skipping. `shownMessage` matches the text a
 * message shows in a list: an optional "New" line (whether a message was
 * unread as the view opened depends on when it arrived), its header (the
 * author's name, then any tag such as `agent`), its short local time, matched
 * by shape since a test can't pin the cookout's clock, then its body.
 */
export {
  CookoutUnderTest,
  type CookoutUnderTestService,
  cookoutUnderTest,
} from "./lib/server/cookout-under-test.ts";
export {
  type BinNeeds,
  type BinResult,
  type BinRun,
  calledThreadId,
  freshStateFolder,
  postedMessageId,
} from "./lib/server/bin.ts";
export { e2eNameStart, requireRunIdentity, runPrefix, runPrefixSpace } from "./lib/server/run-prefix.ts";
export { exampleWebhookCommand, requireExampleWebhookCommand } from "./lib/server/example-command.ts";
export { type BrowserFixtures, type BrowserRun, browserFixtures } from "./lib/server/browser-run.ts";
export { type Answered, type Relay, openRelay } from "./lib/server/relay.ts";
export { shownMessage } from "./lib/server/shown-message.ts";
export {
  type JoinAgent,
  type RunCookout,
  type Session,
  type SessionNeeds,
  type WatchLine,
  type WatchOutput,
  succeeded,
  watchExitTokenRevoked,
  watchLine,
  watchOutput,
} from "./lib/server/session.ts";

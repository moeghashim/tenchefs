/**
 * The test composition root, importable only from tests. `runDev`,
 * `startDev` (`startProbedDev` with `--probe`, `startDevServing` with `--web` and a built web folder) and `startFakeRoutine` run the dev program's commands (ADR 0079) in process. It builds the test
 * Layers (a cookout on port 0 with memory storage and test secrets, its
 * admin on a token it makes and identities seeded through `Storage`, both storage
 * Layers on fresh stores, a store that is unusable). `assetStoreLayers` are the asset store Layers on fresh stores, S3 on
 * a fresh bucket in the `s3` project's throwaway container, and `s3ServeSettings` puts `cookout serve` on one. `freshSqliteQueryPlans` and `freshPostgresQueryPlans` run work on a fresh
 * SQLite or Postgres store and return the query plan of each statement it ran. It runs `cookout`
 * command lines in the test's own process, `serve` included, with their
 * output captured, and runs the `cookout` binary as a process only where a
 * test is about the process itself, since each spawn costs a cold start;
 * `watchCookout` and `watchCookoutBinary` read a long-running command's
 * stdout line by line, and `signalWatchBinary` sends a started `cookout watch` process SIGTERM and times, on the
 * live clock, how long it takes to exit.
 * Tests run effects with `@effect/vitest`, which provides `TestClock`: a
 * test cookout starts at `testStartTime`, and an agent session token's expiry moves with it.
 * `twoSessions` gives an identity two separate SDK sessions, and
 * `freshStateFolder`, `agentSessionStateFiles` and `writeAgentSessionStates` make and
 * read a CLI session's agent session state folder. `builtWebFolder` stands in for
 * the Vite build that `cookout serve` serves at `/`. A test cookout comes
 * with its own webhook fake, `webhook`, for a command to deliver its calls to,
 * and `pendingDeliveries` reads the deliveries its storage holds as pending. `restartServerAfter` stops the server,
 * runs an effect while it is down (moving the `TestClock` on, say) and boots it again on the same storage;
 * `seedMessage` stores a message as it is given, with any `createdAt`, as if posted before the test began.
 * `cuttableLink` puts a link in front of a server that a test can cut, to
 * drop a client's connection, take down, so every later request gets 502, or
 * answer 502 to just its next few requests (or those to one path), as a deploy
 * does, and wait until it has answered 502 so many times, or freeze, so it stops answering: open streams send
 * nothing more and every later request waits for ever.
 * `pastOwnPresence` reads an all-channels feed past its own caller coming online, and `watchingAllChannels` opens one so.
 * `wakingAgents` joins agents with the fake wake command and starts a runner for them, and `runnerEventsIn` and
 * `untilRunnerEvents` read its event log through `cookout runner logs`.
 * `silentConnection` connects to a server and sends nothing. `cuttableRelay`,
 * from the http module, is a link a test can cut and restore, from another
 * process too, as the browser tests do.
 */
export { answer, refusal } from "./lib/server/calls.ts";
export { pastOwnPresence, watchingAllChannels } from "./lib/server/own-presence.ts";
export { type ChannelFixtureOptions, channelFixture, channelName } from "./lib/server/channels.ts";
export {
  type WebhookCommandFixtureOptions,
  webhookCommandFixture,
  webhookCommandName,
  handlerFixture,
} from "./lib/server/commands.ts";
export {
  type CliResult,
  type CommandLineNeeds,
  commandLineServices,
  runCookout,
  runDev,
  type ServeProcess,
  type ServeOptions,
  runServe,
  startServe,
  type Watched,
  watchCookout,
} from "./lib/server/command-line.ts";
export { interruptCookout } from "./lib/server/cli-interrupt.ts";
export { type DevProcess, startDev, startDevServing, startFakeRoutine, startProbedDev } from "./lib/server/dev.ts";
export {
  runCookoutBinary,
  watchCookoutBinary,
} from "./lib/server/process.ts";
export { signalWatchBinary, type StoppedWatch } from "./lib/server/cli-signal.ts";
export { runCookoutWhile } from "./lib/server/cli-clock.ts";
export { type FakeWakeSettings, type StartedRunner, fakeWakeCommand, startRunner } from "./lib/server/runner.ts";
export {
  type RegistrationFile,
  type WakeLogLine,
  agentSessionTokenIn,
  agentSessionTokensIn,
  registeredAgentsIn,
  registrationIn,
  runnerWritten,
  wakeEvents,
  wakeLog,
} from "./lib/server/wake-runs.ts";
export {
  type EventKind,
  type RunnerEvent,
  type WakingAgent,
  type WakingAgents,
  eventsOfKind,
  joinedAgent,
  runnerEventsIn,
  runnerEventsOf,
  untilRunnerEvents,
  wakingAgents,
} from "./lib/server/runner-events.ts";
export { type BoardAgent, type WakeBoard, WAKE_CHANNEL, boardAgent, wakeBoard } from "./lib/server/wake-board.ts";
export { joinWaking, mention, mentions, repliesTo, startsIn } from "./lib/server/wake-agents.ts";
export { type IdentityFixtureOptions, identityFixture, identityName } from "./lib/server/identities.ts";
export { type CuttableLink, cuttableLink } from "./lib/server/cuttable-link.ts";
export { cuttableRelay } from "../http/server.ts";
export { type SilentConnection, silentConnection } from "./lib/server/silent-connection.ts";
export { type FixedAnswer, serverAnswering } from "./lib/server/fixed-answer.ts";
export { type SilentServer, silentServer } from "./lib/server/silent-server.ts";
export { type ForwardingProxy, type ForwardingProxyOptions, forwardingProxy } from "./lib/server/forwarding-proxy.ts";
export {
  type TwoSessions,
  freshStateFolder,
  agentSessionStateFiles,
  twoSessions,
  writeAgentSessionStates,
} from "./lib/server/agent-sessions.ts";
export { callId, secretsTest } from "./lib/server/secrets.ts";
export { type NewMessageOptions, appendTo, messageId, newMessageFixture } from "./lib/server/messages.ts";
export {
  freshDatabasePath,
  freshPostgresQueryPlans,
  freshSqliteQueryPlans,
  openStore,
  storageLayers,
} from "./lib/server/storage.ts";
export { emptyPostgresDatabase, onPostgresDatabase } from "./lib/server/postgres.ts";
export { assetStoreLayers, freshS3Bucket, s3ServeSettings } from "./lib/server/s3.ts";

export {
  type BootedServer,
  type CreateTestIdentityOptions,
  TestCookout,
  type TestCookoutOptions,
  type TestCookoutService,
  type TestIdentity,
  testCookout,
} from "./lib/server/cookout.ts";
export type { LastEnd } from "./lib/server/booted.ts";
export { fixtureTime, isoTime, testStartTime } from "./lib/server/time.ts";
export { triggerToken } from "../webhook-fake/server.ts";
export { type BuiltWeb, builtWebFolder } from "./lib/server/web.ts";
export { type ServiceHost, type ServiceHostOptions, serviceHost } from "./lib/server/service-host.ts";

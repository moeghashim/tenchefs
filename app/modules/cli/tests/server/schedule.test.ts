import type { CommandLineNeeds, TestCookout as TestCookoutTag } from "../../../testing/server.ts";
import { Effect, Layer } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

type Run = (args: readonly string[]) => ReturnType<typeof runCookout>;

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const FIRST_ID = "1";
const SEQUENTIAL = { concurrency: 1 } as const;

const services = Layer.merge(testCookout(), commandLineServices);

const adaRuns: Effect.Effect<Run, never, TestCookoutTag | CommandLineNeeds | Scope.Scope> = Effect.gen(
  function* adaAtTheGrill() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* answer(() => ada.client.createChannel({ name: "grill" }));
    const folder = yield* freshStateFolder;
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: ada.token, COOKOUT_URL: cookout.url };
    return (args) => runCookout({ args, env });
  },
);

it.effect("cookout schedule create takes --cron or --at, and list shows a channel's schedules", () =>
  Effect.gen(function* createAndList() {
    const run = yield* adaRuns;
    const created = yield* run(["schedule", "create", "grill", "standup", "--cron", "0 9 * * 1-5", "--tz", "UTC"]);
    const once = yield* run(["schedule", "create", "grill", "lunch", "--at", "2026-01-01T12:00Z"]);
    const listed = yield* run(["schedule", "list", "grill"]);
    const refused = yield* run(["schedule", "create", "grill", "spam", "--cron", "*/5 * * * *", "--tz", "UTC"]);

    expect(created).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: { scheduledMessage: { cron: "0 9 * * 1-5" } },
    });
    expect(once).toMatchObject({ stdoutJson: { scheduledMessage: { at: "2026-01-01T12:00:00.000Z" } } });
    expect(listed).toMatchObject({ stdoutJson: { scheduledMessages: [{ text: "standup" }, { text: "lunch" }] } });
    expect(refused.exitCode).toBe(EXIT_FAILURE);
  }).pipe(Effect.provide(services)),
);

it.effect("cookout schedule pause, resume and delete change a Scheduled message by its ID", () =>
  Effect.gen(function* changeByVerb() {
    const run = yield* adaRuns;
    yield* run(["schedule", "create", "grill", "standup", "--cron", "0 9 * * 1-5"]);
    const changed = yield* Effect.forEach(
      ["pause", "resume", "delete"],
      (verb) => run(["schedule", verb, FIRST_ID]),
      SEQUENTIAL,
    );
    const listed = yield* run(["schedule", "list"]);
    const badId = yield* run(["schedule", "pause", "0"]);

    expect(changed).toMatchObject([
      { stdoutJson: { scheduledMessage: { status: "paused" } } },
      { stdoutJson: { scheduledMessage: { status: "active" } } },
      { exitCode: EXIT_SUCCESS },
    ]);
    expect(listed).toMatchObject({ stdoutJson: { scheduledMessages: [] } });
    expect(badId.exitCode).not.toBe(EXIT_SUCCESS);
  }).pipe(Effect.provide(services)),
);

const adminRunsAfterAdaIsDeactivated: Effect.Effect<Run, never, TestCookoutTag | CommandLineNeeds | Scope.Scope> =
  Effect.gen(function* deactivateAda() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* answer(() => ada.client.createChannel({ name: "grill" }));
    yield* answer(() =>
      ada.client.createScheduledMessage({ channel: "grill", cron: "0 9 * * 1-5", text: "standup", timeZone: "UTC" }),
    );
    yield* answer(() => cookout.client.deactivateIdentity("ada"));
    const folder = yield* freshStateFolder;
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: cookout.adminToken, COOKOUT_URL: cookout.url };
    return (args) => runCookout({ args, env });
  });

it.effect("cookout schedule list and get show why a Deactivated creator's schedule is paused", () =>
  Effect.gen(function* deactivatedCreator() {
    const run = yield* adminRunsAfterAdaIsDeactivated;
    const listed = yield* run(["schedule", "list"]);
    const shown = yield* run(["schedule", "get", FIRST_ID]);

    expect(listed).toMatchObject({ stdoutJson: { scheduledMessages: [{ pausedBecause: "creator_deactivated" }] } });
    expect(shown).toMatchObject({
      exitCode: EXIT_SUCCESS,
      stdoutJson: { scheduledMessage: { pausedBecause: "creator_deactivated", status: "paused" } },
    });
  }).pipe(Effect.provide(services)),
);

import { Array as Arr, Effect } from "effect";
import { TestCookout, answer, refusal, testCookout, webhookCommandFixture } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const ONE_CALL = 1;
const deploy = { name: "schedule", schema: { type: "object" }, url: "https://hooks.example.com/schedule" };

it.effect("a Webhook command named like a Command is refused with 409 and stores nothing", () =>
  Effect.gen(function* commandName() {
    const cookout = yield* TestCookout;
    const error = yield* refusal(() => cookout.client.addCommand(deploy));
    const { commands } = yield* answer(cookout.client.listCommands);
    const handler = yield* refusal(() => cookout.client.getIdentity("schedule"));

    expect(error).toMatchObject({ code: "command_exists", status: 409 });
    expect(error.message).toContain("schedule is a Command's name");
    expect(Arr.map(commands, ({ name }) => name)).toStrictEqual([]);
    expect(handler).toMatchObject({ code: "identity_not_found" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "a Webhook command stored under a Command's name before the refusal is still called, listed and rotated",
  () =>
    Effect.gen(function* storedCommandName() {
      const cookout = yield* TestCookout;
      const stored = webhookCommandFixture("schedule");
      yield* cookout.seedCommand({ ...stored, command: { ...stored.command, url: `${cookout.webhook.url}/schedule` } });
      yield* answer(() => cookout.client.createChannel({ name: "grill" }));
      const called = yield* answer(() => cookout.client.callCommand("schedule", { channel: "grill", data: {} }));
      const calls = yield* cookout.webhook.waitForCalls(ONE_CALL);
      const { commands } = yield* answer(cookout.client.listCommands);
      const rotated = yield* answer(() => cookout.client.rotateCommandSecret("schedule"));

      expect(calls).toMatchObject([{ body: { command: "schedule", threadId: called.threadId }, path: "/schedule" }]);
      expect([Arr.map(commands, ({ name }) => name), rotated.command.name]).toStrictEqual([["schedule"], "schedule"]);
    }).pipe(Effect.provide(testCookout())),
);

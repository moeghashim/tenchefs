import type { CliResult, CommandLineNeeds } from "../../../testing/server.ts";
import { Effect, pipe } from "effect";
import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function runAll(
  env: Readonly<Record<string, string>>,
  commandLines: readonly (readonly string[])[],
): Effect.Effect<readonly CliResult[], never, CommandLineNeeds> {
  return pipe(
    commandLines,
    Effect.forEach((args) => runCookout({ args, env }), ONE_AT_A_TIME),
  );
}

it.effect(
  "cookout message post is refused thread_moved, replies on stderr, until --seen covers the newer reply; --seen alone is refused",
  () =>
    Effect.gen(function* postWithSeen() {
      const cookout = yield* TestCookout;
      const ann = yield* cookout.createIdentity("ann", { kind: "human" });
      const bot = yield* cookout.createIdentity("bot");
      const folder = yield* freshStateFolder;
      const { message } = yield* Effect.andThen(
        answer(() => ann.client.createChannel({ name: "grill" })),
        answer(() => ann.client.createMessage({ channel: "grill", text: "deploy main?" })),
      );
      const newer = yield* answer(() =>
        ann.client.createMessage({ channel: "grill", replyTo: message.id, text: "on it" }),
      );
      const parent = String(message.id);
      const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bot.token, COOKOUT_URL: cookout.url };
      const results = yield* runAll(env, [
        ["message", "post", "grill", "me too", "--reply-to", parent],
        ["message", "post", "grill", "ok", "--reply-to", parent, "--seen", String(newer.message.id)],
        ["message", "post", "grill", "hi", "--seen", parent],
      ]);

      expect(results).toMatchObject([
        {
          exitCode: 1,
          stderrJson: {
            error: {
              code: "thread_moved",
              details: { replies: [{ id: newer.message.id, text: "on it" }] },
              message: "The thread has 1 newer reply you haven't seen. Read it before you post again.",
            },
          },
          stdout: "",
        },
        { exitCode: 0, stderr: "", stdoutJson: { message: { text: "ok" } } },
        { exitCode: 1, stderrJson: { error: { code: "usage" } }, stdout: "" },
      ]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

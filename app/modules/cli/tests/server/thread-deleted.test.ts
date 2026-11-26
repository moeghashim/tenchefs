import {
  TestCookout,
  answer,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

it.effect("cookout message post --reply-to … --seen … into a deleted thread prints thread_deleted on stderr", () =>
  Effect.gen(function* postIntoDeleted() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann", { kind: "human" });
    const bot = yield* cookout.createIdentity("bot");
    const folder = yield* freshStateFolder;
    const { message } = yield* Effect.andThen(
      answer(() => ann.client.createChannel({ name: "grill" })),
      answer(() => ann.client.createMessage({ channel: "grill", text: "deploy main?" })),
    );
    const read = yield* answer(() =>
      ann.client.createMessage({ channel: "grill", replyTo: message.id, text: "on it" }),
    );
    yield* answer(() => ann.client.deleteMessage(message.id));
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: bot.token, COOKOUT_URL: cookout.url };
    const result = yield* runCookout({
      args: ["message", "post", "grill", "me too", "--reply-to", String(message.id), "--seen", String(read.message.id)],
      env,
    });

    expect(result).toMatchObject({
      exitCode: 1,
      stderrJson: {
        error: { code: "thread_deleted", message: "The thread was deleted since you read it. Nothing was posted." },
      },
      stdout: "",
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

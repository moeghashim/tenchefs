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
import type { MessageId } from "../../../messages/index.ts";

const ONE_AT_A_TIME = { concurrency: 1 } as const;

function deleting(message: MessageId): readonly (readonly string[])[] {
  return [
    ["message", "delete", String(message)],
    ["message", "delete", String(message)],
    ["message", "delete", "0"],
  ];
}

it.effect("cookout message delete prints the deleted message, and a second delete is refused on stderr", () =>
  Effect.gen(function* deleteFromCommandLine() {
    const cookout = yield* TestCookout;
    const ann = yield* cookout.createIdentity("ann");
    const folder = yield* freshStateFolder;
    const { message } = yield* Effect.andThen(
      answer(() => ann.client.createChannel({ name: "grill" })),
      answer(() => ann.client.createMessage({ channel: "grill", text: "oops, wrong channel" })),
    );
    const env = { COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: ann.token, COOKOUT_URL: cookout.url };
    const results = yield* pipe(
      deleting(message.id),
      Effect.forEach((args) => runCookout({ args, env }), ONE_AT_A_TIME),
    );

    expect(results).toMatchObject([
      { exitCode: 0, stdoutJson: { message: { id: message.id, text: "oops, wrong channel" } } },
      { exitCode: 1, stderrJson: { error: { code: "message_not_found" } }, stdout: "" },
      { exitCode: 1, stdout: "" },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

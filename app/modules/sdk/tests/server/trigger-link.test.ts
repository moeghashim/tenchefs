import { AGENT, PUBLIC_URL, board } from "./trigger-board.ts";
import { Array as Arr, Effect, String as Str } from "effect";
import { expect, it } from "@effect/vitest";
import { testCookout } from "../../../testing/server.ts";

const ONCE = 1;

function linkIn(text: string): string {
  return Arr.headNonEmpty(Str.split(text, "\n"));
}

it.effect("the message link a trigger call POSTs starts with the board's public URL", () =>
  Effect.gen(function* linkOnPublicUrl() {
    const on = yield* board;
    const id = yield* Effect.map(on.mention(), String);
    const calls = yield* on.cookout.triggers.waitForCalls(ONCE);

    expect(Arr.map(calls, ({ text }) => linkIn(text))).toStrictEqual([
      `${PUBLIC_URL}/#/channels/grill/threads/${id}/messages/${id}`,
    ]);
  }).pipe(Effect.provide(testCookout({ publicUrl: PUBLIC_URL, triggers: "scripted" }))),
);

it.effect(
  "without a public URL, the message link a trigger call POSTs starts with the address the board serves on",
  () =>
    Effect.gen(function* linkOnServedAddress() {
      const on = yield* board;
      const id = yield* Effect.map(on.mention(`@${AGENT} look`), String);
      const calls = yield* on.cookout.triggers.waitForCalls(ONCE);

      expect(Arr.map(calls, ({ text }) => linkIn(text))).toStrictEqual([
        `${on.cookout.url}/#/channels/grill/threads/${id}/messages/${id}`,
      ]);
    }).pipe(Effect.provide(testCookout({ triggers: "scripted" }))),
);

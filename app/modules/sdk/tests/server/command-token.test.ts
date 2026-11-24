import { Array as Arr, Effect, Option, Predicate } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { CookoutClient } from "../../index.ts";
import type { MessageId } from "../../../messages/index.ts";
import { TestClock } from "effect/testing";
import type { TestCookoutService } from "../../../testing/server.ts";
import { createCookoutClient } from "../../index.ts";

const ONE_CALL = 1;
const TWO_CALLS = 2;
const UNAVAILABLE = 503;
const FORBIDDEN = 403;
const UNAUTHORIZED = 401;
const schema = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" };

interface DeliveredCall {
  readonly handler: CookoutClient;
  readonly threadId: MessageId;
}

function tokenIn(body: unknown): string {
  if (Predicate.hasProperty(body, "token") && Predicate.isString(body.token)) {
    return body.token;
  }
  throw new Error("The delivery has no command token.");
}

function deliveredCall(cookout: TestCookoutService): Effect.Effect<DeliveredCall> {
  return Effect.gen(function* callDeploy() {
    yield* answer(() => cookout.client.addCommand({ name: "deploy", schema, url: `${cookout.webhook.url}/deploy` }));
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const { threadId } = yield* answer(() =>
      cookout.client.callCommand("deploy", { channel: "grill", data: { branch: "main" } }),
    );
    const calls = yield* cookout.webhook.waitForCalls(ONE_CALL);
    const { body } = Option.getOrThrow(Arr.head(calls));
    return { handler: cookout.clientFor(tokenIn(body)), threadId };
  });
}

it.effect("the command token posts replies in its call's thread as the command's handler", () =>
  Effect.gen(function* repliesInThread() {
    const cookout = yield* TestCookout;
    const { handler, threadId } = yield* deliveredCall(cookout);
    const first = yield* answer(() =>
      handler.createMessage({ channel: "grill", replyTo: threadId, text: "deploying main" }),
    );
    const second = yield* answer(() =>
      handler.createMessage({ channel: "grill", replyTo: first.message.id, text: "deployed main" }),
    );

    expect([first.message, second.message]).toMatchObject([
      { author: { name: "deploy" }, kind: "reply", replyTo: threadId },
      { author: { name: "deploy" }, kind: "reply", replyTo: threadId },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "the command token gets 403 on another thread, another channel, a top-level message, a close or another route",
  () =>
    Effect.gen(function* outsideThread() {
      const cookout = yield* TestCookout;
      const { handler, threadId } = yield* deliveredCall(cookout);
      yield* answer(() => cookout.client.createChannel({ name: "smoke" }));
      const other = yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "another thread" }));
      const elsewhere = yield* answer(() => cookout.client.createMessage({ channel: "smoke", text: "elsewhere" }));
      const refused = yield* Effect.all(
        [
          refusal(() => handler.createMessage({ channel: "grill", replyTo: other.message.id, text: "wrong thread" })),
          refusal(() =>
            handler.createMessage({ channel: "smoke", replyTo: elsewhere.message.id, text: "wrong channel" }),
          ),
          refusal(() => handler.createMessage({ channel: "smoke", replyTo: threadId, text: "thread, wrong channel" })),
          refusal(() => handler.createMessage({ channel: "grill", text: "top-level" })),
          refusal(() => handler.listChannels()),
          refusal(() => handler.search({ query: "deploy" })),
          refusal(() => handler.closeThread(threadId)),
          refusal(() => handler.createMessage({ channel: "grill", close: true, replyTo: threadId, text: "done" })),
        ],
        { concurrency: 1 },
      );
      const thread = yield* answer(() => cookout.client.getThread(threadId));

      expect(refused).toMatchObject(
        Arr.replicate({ code: "outside_command_thread", status: FORBIDDEN }, refused.length),
      );
      expect(thread.replies).toStrictEqual([]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("the command token works until 24 h after the call, then gets 401", () =>
  Effect.gen(function* expires() {
    const cookout = yield* TestCookout;
    const { handler, threadId } = yield* deliveredCall(cookout);
    yield* TestClock.adjust("23 hours");
    const late = yield* answer(() => handler.createMessage({ channel: "grill", replyTo: threadId, text: "late" }));
    yield* TestClock.adjust("1 hour");
    const error = yield* refusal(() =>
      handler.createMessage({ channel: "grill", replyTo: threadId, text: "too late" }),
    );

    expect(late.message).toMatchObject({ author: { name: "deploy" }, kind: "reply" });
    expect(error).toMatchObject({ code: "token_expired", status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout())),
);

function handlerAfterRestart(cookout: TestCookoutService): Effect.Effect<CookoutClient> {
  return Effect.gen(function* restartMidBackoff() {
    yield* TestClock.adjust("5 seconds");
    const { url } = yield* cookout.restartServer;
    yield* TestClock.adjust("10 seconds");
    const calls = yield* cookout.webhook.waitForCalls(TWO_CALLS);
    return createCookoutClient({ env: {}, token: tokenIn(Arr.getUnsafe(calls, ONE_CALL).body), url });
  });
}

it.effect("a delivery resumed after a restart sends a command token that still expires 24 h after the call", () =>
  Effect.gen(function* resumedTokenKeepsExpiry() {
    const cookout = yield* TestCookout;
    yield* cookout.webhook.failNext(ONE_CALL, UNAVAILABLE);
    const { threadId } = yield* deliveredCall(cookout);
    const resumed = yield* handlerAfterRestart(cookout);
    yield* TestClock.adjust("86387 seconds");
    const error = yield* refusal(() =>
      resumed.createMessage({ channel: "grill", replyTo: threadId, text: "after the call's 24 h" }),
    );

    expect(error).toMatchObject({ code: "token_expired", status: UNAUTHORIZED });
  }).pipe(Effect.provide(testCookout({ storage: "sqlite", webhookTimeoutSeconds: 86_400 }))),
);

it.effect("the caller follows the call's thread, so the handler's result reply shows in the caller's inbox", () =>
  Effect.gen(function* resultInInbox() {
    const cookout = yield* TestCookout;
    const { handler, threadId } = yield* deliveredCall(cookout);
    const { message } = yield* answer(() =>
      handler.createMessage({ channel: "grill", replyTo: threadId, text: "deployed main" }),
    );
    const { items } = yield* answer(() => cookout.client.inbox());

    expect(items).toMatchObject([{ message: { id: message.id, text: "deployed main" }, parent: { id: threadId } }]);
  }).pipe(Effect.provide(testCookout())),
);

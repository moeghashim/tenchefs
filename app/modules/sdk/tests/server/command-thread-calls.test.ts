import { Array as Arr, Effect, Option, Predicate } from "effect";
import type { CallCommandResponse, CookoutClient, CookoutError, ThreadResponse } from "../../index.ts";
import { TestCookout, answer, messageId, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../../messages/index.ts";
import { TestClock } from "effect/testing";
import type { TestCookoutService } from "../../../testing/server.ts";
import { createCookoutClient } from "../../index.ts";

const FIRST_CALL = 0;
const ONE_CALL = 1;
const TWO_CALLS = 2;
const SIX_CALLS = 6;
const UNAVAILABLE = 503;
const FORBIDDEN = 403;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const CONFLICT = 409;
const MISSING = 999_999;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const FAILED = "The delivery of /deploy to its handler failed after 5 retries.";
const schema = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" };
const patientCookout = testCookout({ webhookTimeoutSeconds: 86_400 });

interface Thread {
  readonly parent: MessageId;
  readonly first: MessageId;
}

function tokenIn(body: unknown): string {
  if (Predicate.hasProperty(body, "token") && Predicate.isString(body.token)) {
    return body.token;
  }
  throw new Error("The delivery has no command token.");
}

function deployAndThread(cookout: TestCookoutService): Effect.Effect<Thread> {
  return Effect.gen(function* addDeployAndAThread() {
    yield* answer(() => cookout.client.addCommand({ name: "deploy", schema, url: `${cookout.webhook.url}/deploy` }));
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "ship it?" }));
    const { message: first } = yield* answer(() =>
      cookout.client.createMessage({ channel: "grill", replyTo: message.id, text: "after lunch" }),
    );
    return { first: first.id, parent: message.id };
  });
}

function callInto(cookout: TestCookoutService, replyTo: MessageId): Effect.Effect<CallCommandResponse> {
  return answer(() => cookout.client.callCommand("deploy", { channel: "grill", data: { branch: "main" }, replyTo }));
}

function refusedCall(cookout: TestCookoutService, replyTo: MessageId): Effect.Effect<CookoutError> {
  return refusal(() => cookout.client.callCommand("deploy", { channel: "grill", data: { branch: "main" }, replyTo }));
}

function handlerAt(calls: readonly { readonly body: unknown }[], index: number): string {
  return tokenIn(Arr.getUnsafe(calls, index).body);
}

function hasFailureReply({ replies }: ThreadResponse): boolean {
  return Arr.some(replies, ({ text }) => text === FAILED);
}

function failedEveryAttempt(cookout: TestCookoutService, parent: MessageId): Effect.Effect<ThreadResponse> {
  return Effect.gen(function* advanceUntilFailed() {
    const step = Effect.andThen(TestClock.adjust("5 seconds"), TestClock.withLive(Effect.sleep("1 millis")));
    yield* Effect.raceFirst(cookout.webhook.waitForCalls(SIX_CALLS), Effect.forever(step));
    const thread = answer(() => cookout.client.getThread(parent));
    return yield* Effect.repeat(thread, { until: hasFailureReply });
  });
}

function outsideTargets(cookout: TestCookoutService): Effect.Effect<readonly MessageId[]> {
  return Effect.gen(function* elsewhereAndDeleted() {
    yield* answer(() => cookout.client.createChannel({ name: "smoke" }));
    const elsewhere = yield* answer(() => cookout.client.createMessage({ channel: "smoke", text: "elsewhere" }));
    const gone = yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "gone soon" }));
    yield* answer(() => cookout.client.deleteMessage(gone.message.id));
    return [messageId(MISSING), elsewhere.message.id, gone.message.id];
  });
}

function resumedHandler(cookout: TestCookoutService): Effect.Effect<CookoutClient> {
  return Effect.gen(function* restartMidBackoff() {
    yield* TestClock.adjust("5 seconds");
    const { url } = yield* cookout.restartServer;
    yield* TestClock.adjust("10 seconds");
    const calls = yield* cookout.webhook.waitForCalls(TWO_CALLS);
    return createCookoutClient({ env: {}, token: handlerAt(calls, ONE_CALL), url });
  });
}

it.effect("a call replying to a thread's top-level message posts the call message as a reply in that thread", () =>
  Effect.gen(function* callAsReply() {
    const cookout = yield* TestCookout;
    const { parent } = yield* deployAndThread(cookout);
    const called = yield* callInto(cookout, parent);
    const { replies } = yield* answer(() => cookout.client.getThread(parent));

    expect(called.threadId).toBe(parent);
    expect(Option.getOrThrow(Arr.last(replies))).toMatchObject({
      data: { command: "deploy", data: { branch: "main" } },
      id: called.messageId,
      kind: "reply",
      replyTo: parent,
      text: "/deploy",
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a call replying to a reply attaches to that reply's thread", () =>
  Effect.gen(function* callReplyingToReply() {
    const cookout = yield* TestCookout;
    const { first, parent } = yield* deployAndThread(cookout);
    const called = yield* callInto(cookout, first);
    const { replies } = yield* answer(() => cookout.client.getThread(parent));

    expect(called.threadId).toBe(parent);
    expect(Arr.map(replies, ({ id }) => id)).toStrictEqual([first, called.messageId]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the handler's webhook carries the thread, and its command token replies there and nowhere else", () =>
  Effect.gen(function* handlerInThread() {
    const cookout = yield* TestCookout;
    const { first, parent } = yield* deployAndThread(cookout);
    const called = yield* callInto(cookout, first);
    const calls = yield* cookout.webhook.waitForCalls(ONE_CALL);
    const handler = cookout.clientFor(handlerAt(calls, FIRST_CALL));
    const other = yield* answer(() => cookout.client.createMessage({ channel: "grill", text: "another thread" }));
    const result = yield* answer(() =>
      handler.createMessage({ channel: "grill", replyTo: called.messageId, text: "deployed main" }),
    );
    const outside = yield* refusal(() =>
      handler.createMessage({ channel: "grill", replyTo: other.message.id, text: "wrong thread" }),
    );

    expect([calls, result.message, outside]).toMatchObject([
      [{ body: { channel: "grill", threadId: parent } }],
      { author: { name: "deploy" }, kind: "reply", replyTo: parent },
      { code: "outside_command_thread", status: FORBIDDEN },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("once every delivery attempt has failed, the failure reply lands in the thread the call was made in", () =>
  Effect.gen(function* failureInThread() {
    const cookout = yield* TestCookout;
    yield* cookout.webhook.failNext(SIX_CALLS, UNAVAILABLE);
    const { parent } = yield* deployAndThread(cookout);
    const called = yield* callInto(cookout, parent);
    const { replies } = yield* failedEveryAttempt(cookout, parent);

    expect(Arr.map(replies, ({ id }) => id)).toContain(called.messageId);
    expect(Option.getOrThrow(Arr.last(replies))).toMatchObject({
      author: { name: "deploy" },
      replyTo: parent,
      text: FAILED,
    });
  }).pipe(Effect.provide(patientCookout)),
);

it.effect(
  "a call replying to a missing message, one in another channel, or a deleted thread is refused, and nothing is posted or delivered",
  () =>
    Effect.gen(function* refusedTargets() {
      const cookout = yield* TestCookout;
      const { first, parent } = yield* deployAndThread(cookout);
      const targets = yield* outsideTargets(cookout);
      const before = yield* answer(() => cookout.client.listMessages("grill"));
      const refused = yield* Effect.forEach(targets, (replyTo) => refusedCall(cookout, replyTo), ONE_AT_A_TIME);
      const after = yield* answer(() => cookout.client.listMessages("grill"));
      const { replies } = yield* answer(() => cookout.client.getThread(parent));
      const calls = yield* Effect.andThen(TestClock.adjust("1 hour"), cookout.webhook.calls);

      expect(refused).toMatchObject([
        { code: "message_not_found", status: NOT_FOUND },
        { code: "reply_in_other_channel" },
        { code: "thread_deleted", status: CONFLICT },
      ]);
      expect([after, Arr.map(replies, ({ id }) => id), calls]).toStrictEqual([before, [first], []]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("a call into a closed thread reopens it", () =>
  Effect.gen(function* reopens() {
    const cookout = yield* TestCookout;
    const { parent } = yield* deployAndThread(cookout);
    yield* answer(() => cookout.client.closeThread(parent));
    yield* callInto(cookout, parent);
    const thread = yield* answer(() => cookout.client.getThread(parent));

    expect(thread.parent).not.toHaveProperty("closedAt");
    expect(thread.parent).not.toHaveProperty("closedBy");
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "a call made in a thread over 24 h old, resumed after a restart, gets a token that expires 24 h after the call",
  () =>
    Effect.gen(function* resumedInOldThread() {
      const cookout = yield* TestCookout;
      yield* cookout.webhook.failNext(ONE_CALL, UNAVAILABLE);
      const { parent } = yield* deployAndThread(cookout);
      const called = yield* Effect.andThen(TestClock.adjust("2 days"), callInto(cookout, parent));
      const resumed = yield* resumedHandler(cookout);
      const inTime = yield* answer(() =>
        resumed.createMessage({ channel: "grill", replyTo: called.messageId, text: "deployed" }),
      );
      yield* TestClock.adjust("86385 seconds");
      const late = yield* refusal(() =>
        resumed.createMessage({ channel: "grill", replyTo: inTime.message.id, text: "after the call's 24 h" }),
      );

      expect(inTime.message).toMatchObject({ author: { name: "deploy" }, replyTo: parent });
      expect(late).toMatchObject({ code: "token_expired", status: UNAUTHORIZED });
    }).pipe(Effect.provide(testCookout({ storage: "sqlite", webhookTimeoutSeconds: 86_400 }))),
);

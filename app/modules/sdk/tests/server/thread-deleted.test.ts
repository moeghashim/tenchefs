import { Array as Arr, Effect, Option, Predicate } from "effect";
import type { CookoutClient, MessageId } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const CONFLICT = 409;
const HUMAN = { kind: "human" } as const;
const ONE_CALL = 1;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const DELETED = "The thread was deleted.";
const DELETED_SINCE_SEEN = "The thread was deleted since you read it. Nothing was posted.";
const schema = { properties: { branch: { type: "string" } }, required: ["branch"], type: "object" };

interface Board {
  readonly ann: TestIdentity;
  readonly bot: TestIdentity;
  readonly parent: MessageId;
  readonly first: MessageId;
}

function board(cookout: TestCookoutService): Effect.Effect<Board> {
  return Effect.gen(function* annBotAndAThread() {
    const ann = yield* cookout.createIdentity("ann", HUMAN);
    const bot = yield* cookout.createIdentity("bot");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "deploy main?" }));
    const { message: first } = yield* answer(() =>
      ann.client.createMessage({ channel: "grill", replyTo: message.id, text: "on it" }),
    );
    return { ann, bot, first: first.id, parent: message.id };
  });
}

function reply(who: TestIdentity, replyTo: MessageId, text: string): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => who.client.createMessage({ channel: "grill", replyTo, text })),
    ({ message }) => message.id,
  );
}

function tokenIn(body: unknown): string {
  if (Predicate.hasProperty(body, "token") && Predicate.isString(body.token)) {
    return body.token;
  }
  throw new Error("The delivery has no command token.");
}

interface DeliveredCall {
  readonly handler: CookoutClient;
  readonly threadId: MessageId;
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

it.effect("a reply naming any message in a deleted thread is refused thread_deleted, and nothing is stored", () =>
  Effect.gen(function* refusedEverywhere() {
    const cookout = yield* TestCookout;
    const { ann, bot, first, parent } = yield* board(cookout);
    yield* answer(() => ann.client.deleteMessage(parent));
    const refused = yield* Effect.all(
      [
        refusal(() => ann.client.createMessage({ channel: "grill", replyTo: parent, text: "person, parent" })),
        refusal(() => ann.client.createMessage({ channel: "grill", replyTo: first, text: "person, reply" })),
        refusal(() => bot.client.createMessage({ channel: "grill", replyTo: parent, text: "agent, parent" })),
        refusal(() => bot.client.createMessage({ channel: "grill", replyTo: first, text: "agent, reply" })),
      ],
      ONE_AT_A_TIME,
    );
    const found = yield* answer(() => ann.client.search({ query: "person agent" }));

    expect(refused).toMatchObject(
      Arr.replicate({ code: "thread_deleted", message: DELETED, status: CONFLICT }, refused.length),
    );
    expect(found.results).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("with seen, a reply into a deleted thread is refused as deleted since you read it, never as moved", () =>
  Effect.gen(function* refusedSinceSeen() {
    const cookout = yield* TestCookout;
    const { ann, bot, first, parent } = yield* board(cookout);
    yield* reply(ann, parent, "done");
    yield* answer(() => ann.client.deleteMessage(parent));
    const refused = yield* refusal(() =>
      bot.client.createMessage({ channel: "grill", replyTo: parent, seen: first, text: "me too" }),
    );

    expect(refused).toMatchObject({ code: "thread_deleted", message: DELETED_SINCE_SEEN, status: CONFLICT });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deleted replies are not among thread_moved's newer replies", () =>
  Effect.gen(function* deletedNotNewer() {
    const cookout = yield* TestCookout;
    const { ann, bot, first, parent } = yield* board(cookout);
    const gone = yield* reply(ann, parent, "wrong thread, sorry");
    const kept = yield* reply(ann, parent, "merged");
    yield* answer(() => ann.client.deleteMessage(gone));
    const refused = yield* refusal(() =>
      bot.client.createMessage({ channel: "grill", replyTo: parent, seen: first, text: "thanks" }),
    );
    yield* answer(() => ann.client.deleteMessage(kept));
    const posted = yield* answer(() =>
      bot.client.createMessage({ channel: "grill", replyTo: parent, seen: first, text: "thanks" }),
    );

    expect(refused).toMatchObject({ code: "thread_moved", details: { replies: [{ id: kept }] } });
    expect(posted).toMatchObject({ message: { kind: "reply", replyTo: parent, text: "thanks" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reply naming a deleted reply in a live thread joins that thread", () =>
  Effect.gen(function* joinsLiveThread() {
    const cookout = yield* TestCookout;
    const { ann, bot, first, parent } = yield* board(cookout);
    yield* answer(() => ann.client.deleteMessage(first));
    const posted = yield* answer(() =>
      bot.client.createMessage({ channel: "grill", replyTo: first, text: "picking it up" }),
    );
    const thread = yield* answer(() => ann.client.getThread(parent));

    expect(posted).toMatchObject({ message: { kind: "reply", replyTo: parent } });
    expect(thread.replies).toMatchObject([{ id: posted.message.id, text: "picking it up" }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's reply naming a deleted reply is still refused thread_moved for newer replies", () =>
  Effect.gen(function* movedPastDeleted() {
    const cookout = yield* TestCookout;
    const { ann, bot, first, parent } = yield* board(cookout);
    const newer = yield* reply(ann, parent, "merged");
    yield* answer(() => ann.client.deleteMessage(first));
    const refused = yield* refusal(() =>
      bot.client.createMessage({ channel: "grill", replyTo: first, text: "picking it up" }),
    );

    expect(refused).toMatchObject({ code: "thread_moved", details: { replies: [{ id: newer }] } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a Handler's reply with its Webhook command token into a deleted call thread is refused thread_deleted", () =>
  Effect.gen(function* handlerRefused() {
    const cookout = yield* TestCookout;
    const { handler, threadId } = yield* deliveredCall(cookout);
    const { message: first } = yield* answer(() =>
      handler.createMessage({ channel: "grill", replyTo: threadId, text: "deploying main" }),
    );
    yield* answer(() => cookout.client.deleteMessage(threadId));
    const refused = yield* Effect.all(
      [
        refusal(() => handler.createMessage({ channel: "grill", replyTo: threadId, text: "deployed main" })),
        refusal(() => handler.createMessage({ channel: "grill", replyTo: first.id, text: "deployed main" })),
      ],
      ONE_AT_A_TIME,
    );

    expect(refused).toMatchObject(
      Arr.replicate({ code: "thread_deleted", message: DELETED, status: CONFLICT }, refused.length),
    );
  }).pipe(Effect.provide(testCookout())),
);

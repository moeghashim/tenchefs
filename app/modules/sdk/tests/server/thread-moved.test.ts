import { Array as Arr, Effect, Order } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../index.ts";

const BAD_REQUEST = 400;
const CONFLICT = 409;
const HUMAN = { kind: "human" } as const;

interface Board {
  readonly ann: TestIdentity;
  readonly bot: TestIdentity;
  readonly parent: MessageId;
}

function board(cookout: TestCookoutService): Effect.Effect<Board> {
  return Effect.gen(function* annBotAndAThread() {
    const ann = yield* cookout.createIdentity("ann", HUMAN);
    const bot = yield* cookout.createIdentity("bot");
    yield* answer(() => ann.client.createChannel({ name: "grill" }));
    const { message } = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "deploy main?" }));
    return { ann, bot, parent: message.id };
  });
}

function reply(who: TestIdentity, replyTo: MessageId, text: string): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => who.client.createMessage({ channel: "grill", replyTo, text })),
    ({ message }) => message.id,
  );
}

function outcome(who: TestIdentity, replyTo: MessageId): Effect.Effect<string> {
  return Effect.tryPromise({
    catch: () => "refused",
    try: () => who.client.createMessage({ channel: "grill", replyTo, text: "mine" }),
  }).pipe(Effect.match({ onFailure: () => "refused", onSuccess: () => "posted" }));
}

it.effect("an agent's reply to a thread with newer replies by someone else is refused thread_moved with them", () =>
  Effect.gen(function* agentRefused() {
    const cookout = yield* TestCookout;
    const { ann, bot, parent } = yield* board(cookout);
    const newer = yield* reply(ann, parent, "on it");
    yield* answer(() => ann.client.react(newer, "thumbs_up"));
    const refused = yield* refusal(() =>
      bot.client.createMessage({ channel: "grill", replyTo: parent, text: "me too" }),
    );
    const thread = yield* answer(() => ann.client.getThread(parent));

    expect(refused).toMatchObject({
      code: "thread_moved",
      details: { replies: thread.replies },
      message: "The thread has 1 newer reply you haven't seen. Read it before you post again.",
      status: CONFLICT,
    });
    expect(thread.replies).toMatchObject([{ reactions: [{ count: 1 }], text: "on it" }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's reply to a reply counts only the replies after that reply", () =>
  Effect.gen(function* replyToReply() {
    const cookout = yield* TestCookout;
    const { ann, bot, parent } = yield* board(cookout);
    const first = yield* reply(ann, parent, "on it");
    const second = yield* reply(ann, parent, "done");
    const third = yield* reply(ann, parent, "merged");
    const refused = yield* refusal(() =>
      bot.client.createMessage({ channel: "grill", replyTo: first, text: "thanks" }),
    );

    expect(refused).toMatchObject({
      details: { replies: [{ id: second }, { id: third }] },
      message: "The thread has 2 newer replies you haven't seen. Read them before you post again.",
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's reply with seen at the newest reply, or with only its own newer replies, goes through", () =>
  Effect.gen(function* notRefused() {
    const cookout = yield* TestCookout;
    const { ann, bot, parent } = yield* board(cookout);
    const newest = yield* reply(ann, parent, "on it");
    const seen = yield* answer(() =>
      bot.client.createMessage({ channel: "grill", replyTo: parent, seen: newest, text: "me too" }),
    );
    const own = yield* answer(() =>
      bot.client.createMessage({ channel: "grill", replyTo: parent, seen: newest, text: "and again" }),
    );

    expect([seen, own]).toMatchObject([{ message: { text: "me too" } }, { message: { text: "and again" } }]);
    expect(seen).not.toHaveProperty("warning");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("of two agents replying to the same message at the same moment, one is posted and the other refused", () =>
  Effect.gen(function* raceRefusesOne() {
    const cookout = yield* TestCookout;
    const { ann, parent } = yield* board(cookout);
    const pip = yield* cookout.createIdentity("pip");
    const kit = yield* cookout.createIdentity("kit");
    const outcomes = yield* Effect.all([outcome(pip, parent), outcome(kit, parent)], { concurrency: "unbounded" });
    const thread = yield* answer(() => ann.client.getThread(parent));

    expect(Arr.sort(outcomes, Order.String)).toStrictEqual(["posted", "refused"]);
    expect(thread.replies).toHaveLength(Arr.filter(outcomes, (said) => said === "posted").length);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a person's reply to a thread that has moved on is never refused", () =>
  Effect.gen(function* personNeverRefused() {
    const cookout = yield* TestCookout;
    const { ann, bot, parent } = yield* board(cookout);
    yield* reply(bot, parent, "on it");
    const posted = yield* answer(() => ann.client.createMessage({ channel: "grill", replyTo: parent, text: "ok" }));

    expect(posted).toMatchObject({ message: { text: "ok" } });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("seen on a top-level message is refused", () =>
  Effect.gen(function* seenNeedsReplyTo() {
    const cookout = yield* TestCookout;
    const { bot, parent } = yield* board(cookout);
    const refused = yield* refusal(() => bot.client.createMessage({ channel: "grill", seen: parent, text: "hi" }));

    expect(refused).toMatchObject({ code: "invalid_request", status: BAD_REQUEST });
  }).pipe(Effect.provide(testCookout())),
);

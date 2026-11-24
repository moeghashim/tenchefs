import { Array as Arr, Effect, Predicate } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { MessageId } from "../../index.ts";

const BAD_REQUEST = 400;
const HUMAN = { kind: "human" } as const;
const ONE = 1;

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

it.effect("an agent's reply to a thread with newer replies by someone else warns thread_moved with them", () =>
  Effect.gen(function* agentWarned() {
    const cookout = yield* TestCookout;
    const { ann, bot, parent } = yield* board(cookout);
    const newer = yield* reply(ann, parent, "on it");
    yield* answer(() => ann.client.react(newer, "thumbs_up"));
    const posted = yield* answer(() => bot.client.createMessage({ channel: "grill", replyTo: parent, text: "me too" }));
    const thread = yield* answer(() => ann.client.getThread(parent));

    const [missed, mine] = thread.replies;

    expect(posted.warning).toMatchObject({ code: "thread_moved", details: { replies: [missed] } });
    expect([missed, mine]).toMatchObject([{ reactions: [{ count: 1 }], text: "on it" }, { text: "me too" }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's reply to a reply counts only the replies after that reply", () =>
  Effect.gen(function* replyToReply() {
    const cookout = yield* TestCookout;
    const { ann, bot, parent } = yield* board(cookout);
    const first = yield* reply(ann, parent, "on it");
    const second = yield* reply(ann, parent, "done");
    const third = yield* reply(ann, parent, "merged");
    const posted = yield* answer(() => bot.client.createMessage({ channel: "grill", replyTo: first, text: "thanks" }));

    expect(posted).toMatchObject({
      warning: {
        details: { replies: [{ id: second }, { id: third }] },
        message: "The thread has 2 newer replies you haven't seen. Read them before you post again.",
      },
    });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent's reply with seen at the newest reply, or with only its own newer replies, has no warning", () =>
  Effect.gen(function* noWarning() {
    const cookout = yield* TestCookout;
    const { ann, bot, parent } = yield* board(cookout);
    const newest = yield* reply(ann, parent, "on it");
    const seen = yield* answer(() =>
      bot.client.createMessage({ channel: "grill", replyTo: parent, seen: newest, text: "me too" }),
    );
    const own = yield* answer(() =>
      bot.client.createMessage({ channel: "grill", replyTo: parent, seen: newest, text: "and again" }),
    );

    expect(seen).not.toHaveProperty("warning");
    expect(own).not.toHaveProperty("warning");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("of two agents replying to the same message at the same moment, exactly one is warned", () =>
  Effect.gen(function* raceWarnsOne() {
    const cookout = yield* TestCookout;
    const { parent } = yield* board(cookout);
    const pip = yield* cookout.createIdentity("pip");
    const kit = yield* cookout.createIdentity("kit");
    const posted = yield* Effect.all(
      [
        answer(() => pip.client.createMessage({ channel: "grill", replyTo: parent, text: "mine" })),
        answer(() => kit.client.createMessage({ channel: "grill", replyTo: parent, text: "no, mine" })),
      ],
      { concurrency: "unbounded" },
    );

    expect(Arr.filter(posted, (answered) => Predicate.hasProperty(answered, "warning"))).toHaveLength(ONE);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a person's reply to a thread that has moved on never warns", () =>
  Effect.gen(function* personNeverWarned() {
    const cookout = yield* TestCookout;
    const { ann, bot, parent } = yield* board(cookout);
    yield* reply(bot, parent, "on it");
    const posted = yield* answer(() => ann.client.createMessage({ channel: "grill", replyTo: parent, text: "ok" }));

    expect(posted).not.toHaveProperty("warning");
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

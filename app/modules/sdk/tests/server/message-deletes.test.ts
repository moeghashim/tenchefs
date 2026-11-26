import { TestCookout, answer, messageId, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

const HUMAN = { kind: "human" } as const;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const MISSING = 999_999;
const ONE = 1;
const ONE_AT_A_TIME = { concurrency: 1 } as const;

const board = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  const { message: parent } = yield* answer(() => ada.client.createMessage({ channel: "grill", text: "deploy?" }));
  const { message: reply } = yield* answer(() =>
    bob.client.createMessage({ channel: "grill", replyTo: parent.id, text: "not yet" }),
  );
  return { ada, bob, cookout, parent, reply };
});

it.effect("an author deletes their own reply: it leaves the thread, which no longer counts it", () =>
  Effect.gen(function* deleteOwnReply() {
    const { ada, bob, parent, reply } = yield* board;
    const { message: kept } = yield* answer(() =>
      ada.client.createMessage({ channel: "grill", replyTo: parent.id, text: "ok" }),
    );
    const deleted = yield* answer(() => bob.client.deleteMessage(reply.id));
    const after = yield* Effect.all(
      {
        again: refusal(() => bob.client.deleteMessage(reply.id)),
        page: answer(() => ada.client.listMessages("grill")),
        thread: answer(() => ada.client.getThread(parent.id)),
      },
      ONE_AT_A_TIME,
    );

    expect(deleted).toMatchObject({ message: { id: reply.id, kind: "reply", replyTo: parent.id, text: "not yet" } });
    expect(after).toMatchObject({
      again: { code: "message_not_found", status: NOT_FOUND },
      page: { messages: [{ id: parent.id, latestReplyId: kept.id, repliers: [{ name: "ada" }], replyCount: 1 }] },
      thread: { parent: { id: parent.id, replyCount: 1 }, replies: [{ id: kept.id }] },
    });
    expect(after.thread.replies).toHaveLength(ONE);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deleting a top-level message deletes its thread: the thread reads as missing and leaves the channel", () =>
  Effect.gen(function* deleteThread() {
    const { ada, bob, parent, reply } = yield* board;
    const deleted = yield* answer(() => ada.client.deleteMessage(parent.id));
    const after = yield* Effect.all(
      {
        fromParent: refusal(() => bob.client.getThread(parent.id)),
        fromReply: refusal(() => bob.client.getThread(reply.id)),
        page: answer(() => bob.client.listMessages("grill")),
        reply: refusal(() => bob.client.deleteMessage(reply.id)),
      },
      ONE_AT_A_TIME,
    );
    const missing = { code: "message_not_found", status: NOT_FOUND };

    expect(deleted).toMatchObject({ message: { id: parent.id, kind: "top-level", replyCount: 1, text: "deploy?" } });
    expect(after).toMatchObject({ fromParent: missing, fromReply: missing, page: { messages: [] }, reply: missing });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("someone else's message is refused with 403 not_owner for a non-admin, and stays", () =>
  Effect.gen(function* refuseOthers() {
    const { ada, bob, parent, reply } = yield* board;
    const refused = yield* Effect.all(
      [refusal(() => bob.client.deleteMessage(parent.id)), refusal(() => ada.client.deleteMessage(reply.id))],
      ONE_AT_A_TIME,
    );
    const thread = yield* answer(() => ada.client.getThread(parent.id));

    expect(refused).toMatchObject([
      { code: "not_owner", status: FORBIDDEN },
      { code: "not_owner", status: FORBIDDEN },
    ]);
    expect(thread).toMatchObject({ parent: { id: parent.id, replyCount: 1 }, replies: [{ id: reply.id }] });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an admin deletes anyone's message", () =>
  Effect.gen(function* adminDeletes() {
    const { cookout, parent, reply } = yield* board;
    const deleted = yield* answer(() => cookout.client.deleteMessage(reply.id));
    const thread = yield* answer(() => cookout.client.getThread(parent.id));

    expect(deleted).toMatchObject({ message: { author: { name: "bob" }, id: reply.id } });
    expect(thread).toMatchObject({ parent: { replyCount: 0 }, replies: [] });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent deletes only its own messages, even with the admin flag", () =>
  Effect.gen(function* agentDeletes() {
    const { cookout, parent } = yield* board;
    const bot = yield* cookout.createIdentity("bot", { admin: true });
    const { message } = yield* answer(() => bot.client.createMessage({ channel: "grill", text: "broken post" }));
    const refused = yield* refusal(() => bot.client.deleteMessage(parent.id));
    const deleted = yield* answer(() => bot.client.deleteMessage(message.id));
    const page = yield* answer(() => bot.client.listMessages("grill"));

    expect(refused).toMatchObject({ code: "not_owner", status: FORBIDDEN });
    expect(deleted).toMatchObject({ message: { author: { name: "bot" }, id: message.id } });
    expect(page.messages).toMatchObject([{ id: parent.id }]);
    expect(page.messages).toHaveLength(ONE);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("deleting a message that doesn't exist is refused with 404 message_not_found", () =>
  Effect.gen(function* deleteMissing() {
    const cookout = yield* TestCookout;
    const refused = yield* refusal(() => cookout.client.deleteMessage(messageId(MISSING)));

    expect(refused).toMatchObject({ code: "message_not_found", status: NOT_FOUND });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an identity whose only messages are deleted is still refused deletion with 409 has_messages", () =>
  Effect.gen(function* stillNamed() {
    const { bob, cookout, reply } = yield* board;
    yield* answer(() => bob.client.deleteMessage(reply.id));
    const refused = yield* refusal(() => cookout.client.deleteIdentity("bob"));

    expect(refused).toMatchObject({ code: "has_messages", status: CONFLICT });
  }).pipe(Effect.provide(testCookout())),
);

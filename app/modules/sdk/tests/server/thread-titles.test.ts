import { Array as Arr, Effect, String as Str } from "effect";
import type { CookoutClient, CookoutEvent, EventStream, MessageId, PostMessageRequest } from "../../index.ts";
import { TestCookout, answer, messageId, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

const MISSING = 999;
const NOT_FOUND = 404;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const LONGEST = 100;
const TOO_LONG = 101;
const BOOT = "2026-01-01T00:00:00.000Z";
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const ALL_CHANNELS = { allChannels: true } as const;
const EVERY_THREAD = { all: true } as const;

interface Board {
  readonly ann: TestIdentity;
  readonly bob: TestIdentity;
}

function board(cookout: TestCookoutService): Effect.Effect<Board> {
  return Effect.gen(function* annAndBob() {
    const ann = yield* cookout.createIdentity("ann");
    const bob = yield* cookout.createIdentity("bob");
    yield* answer(() => cookout.client.createChannel({ name: "grill" }));
    return { ann, bob };
  });
}

function post(who: TestIdentity, text: string, ...replyTo: readonly MessageId[]): Effect.Effect<MessageId> {
  const request: PostMessageRequest = Arr.match(replyTo, {
    onEmpty: () => ({ channel: "grill", text }),
    onNonEmpty: ([parent]) => ({ channel: "grill", replyTo: parent, text }),
  });
  return Effect.map(
    answer(() => who.client.createMessage(request)),
    ({ message }) => message.id,
  );
}

interface Feed {
  readonly nextThread: Effect.Effect<unknown>;
}

function isThreadEvent(next: Readonly<IteratorResult<CookoutEvent, unknown>>): boolean {
  return next.done !== true && next.value.type === "thread";
}

function watching(client: CookoutClient): Effect.Effect<Feed, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch(ALL_CHANNELS)),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => {
      const all = events[Symbol.asyncIterator]();
      return {
        nextThread: answer(() => all.next()).pipe(
          Effect.repeat({ until: isThreadEvent }),
          Effect.map((next: Readonly<IteratorResult<CookoutEvent, unknown>>): unknown => next.value),
        ),
      };
    },
  );
}

it.effect("titling a thread by a reply's ID shows the title, its setter and time on every read of the thread", () =>
  Effect.gen(function* titleByReply() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    const reply = yield* post(ann, "@bob can you check?", parent);
    const { message } = yield* answer(() => bob.client.setThreadTitle(reply, "Deploy main"));
    const [page, thread, inbox, open] = yield* Effect.all(
      [
        answer(() => ann.client.listMessages("grill")),
        answer(() => ann.client.getThread(reply)),
        answer(() => bob.client.inbox()),
        answer(() => ann.client.listOpenThreads()),
      ],
      ONE_AT_A_TIME,
    );

    expect(message).toMatchObject({
      id: parent,
      replyCount: 1,
      text: "deploy main?",
      title: "Deploy main",
      titleSetAt: BOOT,
      titleSetBy: "bob",
    });
    expect([page.messages, thread.parent]).toStrictEqual([[message], message]);
    expect(Arr.map(inbox.items, (item) => item.parent)).toStrictEqual([message]);
    expect(Arr.map(open.threads, (shown) => shown.message)).toStrictEqual([message]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("another identity's title replaces the title and its setter, trimmed", () =>
  Effect.gen(function* retitle() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    yield* answer(() => ann.client.setThreadTitle(parent, "Deploy main"));
    const changed = yield* answer(() => bob.client.setThreadTitle(parent, "  Deploy main, then smoke test  "));

    expect(changed.message).toMatchObject({ title: "Deploy main, then smoke test", titleSetBy: "bob" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an empty or whitespace-only title clears the title, its setter and its time", () =>
  Effect.gen(function* clearTitle() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    const untitled = yield* answer(() => ann.client.getThread(parent));
    yield* answer(() => ann.client.setThreadTitle(parent, "Deploy main"));
    const cleared = yield* answer(() => ann.client.setThreadTitle(parent, "   "));
    yield* answer(() => ann.client.setThreadTitle(parent, "Deploy main"));
    const emptied = yield* answer(() => ann.client.setThreadTitle(parent, ""));

    expect(cleared).toStrictEqual(emptied);
    expect(cleared.message).toStrictEqual(untitled.parent);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a title over 100 characters or with a line break is refused 400, and the thread keeps its title", () =>
  Effect.gen(function* tooLongOrTwoLines() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    const longest = yield* answer(() => ann.client.setThreadTitle(parent, Str.repeat(LONGEST)("a")));
    const refused = yield* Effect.all(
      [
        refusal(() => ann.client.setThreadTitle(parent, Str.repeat(TOO_LONG)("b"))),
        refusal(() => ann.client.setThreadTitle(parent, "Deploy\nmain")),
        refusal(() => ann.client.setThreadTitle(parent, "Deploy\r\nmain")),
      ],
      ONE_AT_A_TIME,
    );
    const thread = yield* answer(() => ann.client.getThread(parent));

    expect(refused).toMatchObject(Arr.replicate({ code: "invalid_request", status: BAD_REQUEST }, refused.length));
    expect(thread.parent).toStrictEqual(longest.message);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("titling a missing message is 404, and a Deactivated identity's title is refused", () =>
  Effect.gen(function* refusals() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    yield* answer(() => cookout.client.deactivateIdentity("bob"));
    const refused = yield* Effect.all(
      [
        refusal(() => ann.client.setThreadTitle(messageId(MISSING), "Deploy main")),
        refusal(() => bob.client.setThreadTitle(parent, "Deploy main")),
      ],
      ONE_AT_A_TIME,
    );
    const thread = yield* answer(() => ann.client.getThread(parent));

    expect(refused).toMatchObject([
      { code: "message_not_found", status: NOT_FOUND },
      { code: "token_revoked", status: UNAUTHORIZED },
    ]);
    expect(thread.parent).not.toHaveProperty("title");
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);

it.effect("an @name in a title mentions nobody, and titling moves no Read position or last activity", () =>
  Effect.gen(function* titleIsNotAMessage() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    const [positions, before] = yield* Effect.all(
      [answer(() => ann.client.readPositions()), answer(() => ann.client.listOpenThreads(EVERY_THREAD))],
      ONE_AT_A_TIME,
    );
    yield* TestClock.adjust("1 hour");
    yield* answer(() => ann.client.setThreadTitle(parent, "@bob deploy main"));
    const [inbox, after, open] = yield* Effect.all(
      [
        answer(() => bob.client.inbox()),
        answer(() => ann.client.readPositions()),
        answer(() => ann.client.listOpenThreads(EVERY_THREAD)),
      ],
      ONE_AT_A_TIME,
    );

    expect(inbox.items).toStrictEqual([]);
    expect(after).toStrictEqual(positions);
    expect(Arr.map(open.threads, (shown) => shown.lastActivityAt)).toStrictEqual(
      Arr.map(before.threads, (shown) => shown.lastActivityAt),
    );
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reply in a closed titled thread reopens it and keeps its title", () =>
  Effect.gen(function* replyKeepsTitle() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    const titled = yield* answer(() => ann.client.setThreadTitle(parent, "Deploy main"));
    yield* answer(() => ann.client.closeThread(parent));
    yield* post(bob, "not yet", parent);
    const thread = yield* answer(() => ann.client.getThread(parent));

    expect(thread.parent).toMatchObject({
      replyCount: 1,
      title: "Deploy main",
      titleSetAt: titled.message.titleSetAt,
      titleSetBy: "ann",
    });
    expect(thread.parent).not.toHaveProperty("closedAt");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("each title change sends one thread event, and setting the same title again sends none", () =>
  Effect.gen(function* titleEvents() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    const feed = yield* watching(bob.client);
    const [titled, afterTitle] = yield* Effect.all(
      [answer(() => ann.client.setThreadTitle(parent, "Deploy main")), feed.nextThread],
      ONE_AT_A_TIME,
    );
    const same = yield* answer(() => bob.client.setThreadTitle(parent, "Deploy main"));
    const [cleared, afterClear] = yield* Effect.all(
      [answer(() => ann.client.setThreadTitle(parent, "")), feed.nextThread],
      ONE_AT_A_TIME,
    );

    expect(same).toStrictEqual(titled);
    expect([afterTitle, afterClear]).toStrictEqual([
      { parent: titled.message, type: "thread" },
      { parent: cleared.message, type: "thread" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

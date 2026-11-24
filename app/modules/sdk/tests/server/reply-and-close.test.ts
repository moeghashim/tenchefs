import { Array as Arr, Effect, Predicate } from "effect";
import type { CookoutEvent, EventStream, MessageId } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const BAD_REQUEST = 400;
const FIRST_ROUND = 1;
const ROUNDS = 20;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const AT_ONCE = { concurrency: "unbounded" } as const;
const ALL_CHANNELS = { allChannels: true } as const;

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

function post(who: TestIdentity, text: string): Effect.Effect<MessageId> {
  return Effect.map(
    answer(() => who.client.createMessage({ channel: "grill", text })),
    ({ message }) => message.id,
  );
}

function isThreadOrMessage(event: CookoutEvent): boolean {
  return event.type === "message" || event.type === "thread";
}

function threadAndMessageEventsUntilReopened(events: EventStream): Effect.Effect<readonly CookoutEvent[]> {
  const all = events[Symbol.asyncIterator]();
  return Effect.gen(function* readUntilReopened() {
    const seen: CookoutEvent[] = [];
    let reopened = false;
    while (!reopened) {
      const next = yield* answer(() => all.next());
      if (next.done === true) {
        return seen;
      }
      if (isThreadOrMessage(next.value)) {
        seen.push(next.value);
      }
      reopened = next.value.type === "thread" && Predicate.isUndefined(next.value.parent.closedAt);
    }
    return seen;
  });
}

it.effect("a reply sent with close stores the reply and closes its thread, as one message and one thread event", () =>
  Effect.gen(function* replyCloses() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* post(ann, "deploy main?");
    const events = yield* Effect.acquireRelease(
      answer(() => ann.client.watch(ALL_CHANNELS)),
      (stream: EventStream) => answer(() => stream.close()),
    );
    const posted = yield* answer(() =>
      bob.client.createMessage({ channel: "grill", close: true, replyTo: parent, text: "deployed" }),
    );
    const thread = yield* answer(() => ann.client.getThread(parent));
    const reopened = yield* answer(() => ann.client.reopenThread(parent));
    const seen = yield* threadAndMessageEventsUntilReopened(events);

    expect(thread).toMatchObject({
      parent: { closedAt: posted.message.createdAt, closedBy: "bob", id: parent, replyCount: 1 },
      replies: [posted.message],
    });
    expect(seen).toStrictEqual([
      { message: posted.message, type: "message" },
      { parent: thread.parent, type: "thread" },
      { parent: reopened.message, type: "thread" },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reply sent with close and a close sent at the same moment always leave the thread closed", () =>
  Effect.gen(function* raceEndsClosed() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parents = yield* Effect.forEach(
      Arr.range(FIRST_ROUND, ROUNDS),
      (round) => post(ann, `job ${String(round)}`),
      {
        concurrency: 1,
      },
    );
    yield* Effect.forEach(
      parents,
      (parent) =>
        Effect.all(
          [
            answer(() => ann.client.closeThread(parent)),
            answer(() => bob.client.createMessage({ channel: "grill", close: true, replyTo: parent, text: "done" })),
          ],
          AT_ONCE,
        ),
      AT_ONCE,
    );
    const threads = yield* Effect.forEach(
      parents,
      (parent) => answer(() => ann.client.getThread(parent)),
      ONE_AT_A_TIME,
    );

    expect(Arr.filter(threads, (thread) => Predicate.isUndefined(thread.parent.closedAt))).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("close without replyTo is 400 invalid_request and posts nothing", () =>
  Effect.gen(function* closeNeedsReply() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const refused = yield* refusal(() => ann.client.createMessage({ channel: "grill", close: true, text: "done" }));
    const page = yield* answer(() => ann.client.listMessages("grill"));

    expect(refused).toMatchObject({ code: "invalid_request", status: BAD_REQUEST });
    expect(page.messages).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

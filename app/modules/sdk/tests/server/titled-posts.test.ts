import { Array as Arr, Effect, String as Str } from "effect";
import type { CookoutEvent, EventStream } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";

const BAD_REQUEST = 400;
const TOO_LONG = 101;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
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

function isMessageEvent(next: Readonly<IteratorResult<CookoutEvent, unknown>>): boolean {
  return next.done !== true && next.value.type === "message";
}

function firstMessageEvent(events: EventStream): Effect.Effect<unknown> {
  const all = events[Symbol.asyncIterator]();
  return answer(() => all.next()).pipe(
    Effect.repeat({ until: isMessageEvent }),
    Effect.map((next: Readonly<IteratorResult<CookoutEvent, unknown>>): unknown => next.value),
  );
}

it.effect("a top-level message posted with a title is titled by its author at its post time, on every read", () =>
  Effect.gen(function* postTitled() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const events = yield* Effect.acquireRelease(
      answer(() => bob.client.watch(ALL_CHANNELS)),
      (stream: EventStream) => answer(() => stream.close()),
    );
    const posted = yield* answer(() =>
      ann.client.createMessage({ channel: "grill", text: "deploy main? @bob", title: "  Deploy @bob main  " }),
    );
    const [page, thread, open, event] = yield* Effect.all(
      [
        answer(() => ann.client.listMessages("grill")),
        answer(() => ann.client.getThread(posted.message.id)),
        answer(() => ann.client.listOpenThreads()),
        firstMessageEvent(events),
      ],
      ONE_AT_A_TIME,
    );

    expect(posted.message).toMatchObject({
      kind: "top-level",
      text: "deploy main? @bob",
      title: "Deploy @bob main",
      titleSetAt: posted.message.createdAt,
      titleSetBy: "ann",
    });
    expect([page.messages, thread.parent]).toStrictEqual([[posted.message], posted.message]);
    expect(Arr.map(open.threads, (shown) => shown.message)).toStrictEqual([posted.message]);
    expect(event).toStrictEqual({ message: posted.message, type: "message" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a post with an empty or whitespace-only title is an untitled message", () =>
  Effect.gen(function* emptyTitle() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const posted = yield* Effect.all(
      [
        answer(() => ann.client.createMessage({ channel: "grill", text: "deploy main?", title: "" })),
        answer(() => ann.client.createMessage({ channel: "grill", text: "smoke test?", title: "   " })),
      ],
      ONE_AT_A_TIME,
    );

    expect(Arr.filter(posted, ({ message }) => "title" in message || "titleSetBy" in message)).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a post with a title and replyTo is refused 400 invalid_request, and no reply is stored", () =>
  Effect.gen(function* titleOnReply() {
    const cookout = yield* TestCookout;
    const { ann, bob } = yield* board(cookout);
    const parent = yield* answer(() => ann.client.createMessage({ channel: "grill", text: "deploy main?" }));
    const refused = yield* refusal(() =>
      bob.client.createMessage({ channel: "grill", replyTo: parent.message.id, text: "done", title: "Deploy main" }),
    );
    const thread = yield* answer(() => ann.client.getThread(parent.message.id));

    expect(refused).toMatchObject({ code: "invalid_request", status: BAD_REQUEST });
    expect(thread).toMatchObject({ parent: parent.message, replies: [] });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a post with a 101-character or two-line title is refused 400 invalid_request, and nothing is stored", () =>
  Effect.gen(function* badTitle() {
    const cookout = yield* TestCookout;
    const { ann } = yield* board(cookout);
    const refused = yield* Effect.all(
      [
        refusal(() => ann.client.createMessage({ channel: "grill", text: "a", title: Str.repeat(TOO_LONG)("a") })),
        refusal(() => ann.client.createMessage({ channel: "grill", text: "b", title: "Deploy\nmain" })),
      ],
      ONE_AT_A_TIME,
    );
    const page = yield* answer(() => ann.client.listMessages("grill"));

    expect(refused).toMatchObject(Arr.replicate({ code: "invalid_request", status: BAD_REQUEST }, refused.length));
    expect(page.messages).toStrictEqual([]);
  }).pipe(Effect.provide(testCookout())),
);

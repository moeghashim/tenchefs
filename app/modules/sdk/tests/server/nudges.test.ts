import { Array as Arr, DateTime, Duration, Effect, Option } from "effect";
import type { CookoutClient, CookoutEvent, EventStream, Message, Nudge, NudgeId } from "../../index.ts";
import { TestCookout, answer, channelName, isoTime, refusal, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";

type Wait = `${number} days` | `${number} millis`;

interface HistoryEntry {
  readonly kind: string;
  readonly read: boolean;
}

interface Closings {
  readonly ada: TestIdentity;
  readonly open: Message;
}

const A_MOMENT = "1 millis";
const HUMAN = { kind: "human" } as const;
const OLDEST = 0;
const NEWEST = 1;
const ONE = 1;
const TWO = 2;
const SETTLE = "30 millis";
const JUST_UNDER_THREE_DAYS = "259199999 millis";
const FIRST_TEXT = "Quiet for 3 days: close it, or follow up?";
const SECOND_TEXT = "Quiet for 10 days: close it, or follow up?";
const BEFORE_NUDGES = isoTime("2025-12-01T00:00:00.000Z");

const board = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  return { ada, bob, cookout };
});

function post(who: TestIdentity, text: string): Effect.Effect<Message> {
  return Effect.map(
    Effect.andThen(
      TestClock.adjust(A_MOMENT),
      answer(() => who.client.createMessage({ channel: "grill", text })),
    ),
    ({ message }) => message,
  );
}

function reply(who: TestIdentity, to: Message): Effect.Effect<Message> {
  return Effect.map(
    answer(() => who.client.createMessage({ channel: "grill", replyTo: to.id, text: "still on it" })),
    ({ message }) => message,
  );
}

const settled: Effect.Effect<void> = TestClock.withLive(Effect.sleep(SETTLE));

function quietFor(wait: Wait): Effect.Effect<void> {
  return Effect.andThen(Effect.andThen(settled, TestClock.adjust(wait)), settled);
}

function unreadNudges(client: CookoutClient): Effect.Effect<readonly Nudge[]> {
  return Effect.map(
    answer(() => client.inbox()),
    ({ nudges }) => nudges,
  );
}

function nudgesOnceThere(client: CookoutClient, count: number): Effect.Effect<readonly Nudge[]> {
  return Effect.repeat(unreadNudges(client), { until: (nudges) => nudges.length >= count });
}

function historyNudges(client: CookoutClient): Effect.Effect<readonly HistoryEntry[]> {
  return Effect.map(
    answer(() => client.inboxHistory()),
    ({ nudges }) => Arr.map(nudges, ({ kind, read }) => ({ kind, read })),
  );
}

function later(at: string, wait: Wait): string {
  return DateTime.formatIso(DateTime.addDuration(DateTime.makeUnsafe(at), Duration.fromInputUnsafe(wait)));
}

function idOf(nudges: readonly Nudge[], index: number): NudgeId {
  return Option.getOrThrow(Option.map(Arr.get(nudges, index), ({ id }) => id));
}

function watching(client: CookoutClient): Effect.Effect<AsyncIterator<CookoutEvent>, never, Scope.Scope> {
  return Effect.map(
    Effect.acquireRelease(
      answer(() => client.watch()),
      (events: EventStream) => answer(() => events.close()),
    ),
    (events) => events[Symbol.asyncIterator](),
  );
}

function eventIn(next: Readonly<IteratorResult<CookoutEvent>>): CookoutEvent | null {
  if (next.done === true) {
    return null;
  }
  return next.value;
}

function nextNudgeEvent(events: AsyncIterator<CookoutEvent>): Effect.Effect<CookoutEvent | null> {
  const next = answer(() => events.next());
  return Effect.map(
    Effect.repeat(next, {
      until: (heard: Readonly<IteratorResult<CookoutEvent>>) => heard.done === true || heard.value.type === "nudge",
    }),
    eventIn,
  );
}

const closedEarlyAndLater: Effect.Effect<Closings, never, TestCookout> = Effect.gen(function* closeTwoThreads() {
  const { ada, bob } = yield* board;
  const closedEarly = yield* post(ada, "done already");
  yield* answer(() => bob.client.closeThread(closedEarly.id));
  const closedLater = yield* post(ada, "who owns the release notes?");
  const open = yield* post(ada, "who owns the changelog?");
  yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, TWO));
  yield* answer(() => bob.client.closeThread(closedLater.id));
  return { ada, open };
});

it.effect("a thread quiet for 3 days nudges its starter, live and in the inbox, and nobody else", () =>
  Effect.gen(function* quietThreeDays() {
    const { ada, bob } = yield* board;
    const thread = yield* post(ada, "who owns the release notes?");
    const justUnder = yield* Effect.andThen(quietFor(JUST_UNDER_THREE_DAYS), unreadNudges(ada.client));
    const events = yield* watching(ada.client);
    const live = yield* Effect.andThen(quietFor("1 millis"), nextNudgeEvent(events));
    const [listed, others] = yield* Effect.all([nudgesOnceThere(ada.client, ONE), unreadNudges(bob.client)], {
      concurrency: 1,
    });

    expect([justUnder, others]).toStrictEqual([[], []]);
    expect(live).toMatchObject({
      nudge: { kind: "first", parent: { id: thread.id }, text: FIRST_TEXT },
      type: "nudge",
    });
    expect(listed).toMatchObject([
      {
        channel: { name: "grill" },
        kind: "first",
        parent: { id: thread.id },
        raisedAt: later(thread.createdAt, "3 days"),
      },
    ]);
  }).pipe(Effect.scoped, Effect.provide(testCookout())),
);

it.effect("7 more quiet days raise the second nudge, and a further month raises no third", () =>
  Effect.gen(function* quietTenDays() {
    const { ada } = yield* board;
    yield* post(ada, "who owns the release notes?");
    yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, ONE));
    const both = yield* Effect.andThen(quietFor("7 days"), nudgesOnceThere(ada.client, TWO));
    const history = yield* Effect.andThen(quietFor("30 days"), historyNudges(ada.client));

    expect(Arr.map(both, ({ kind, text }) => ({ kind, text }))).toStrictEqual([
      { kind: "first", text: FIRST_TEXT },
      { kind: "second", text: SECOND_TEXT },
    ]);
    expect(history).toStrictEqual([
      { kind: "second", read: false },
      { kind: "first", read: false },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a reply at day 2 restarts the clock, so the first nudge comes 3 days after the reply", () =>
  Effect.gen(function* replyRestarts() {
    const { ada, bob } = yield* board;
    const thread = yield* post(ada, "who owns the release notes?");
    yield* quietFor("2 days");
    const answered = yield* reply(bob, thread);
    const early = yield* Effect.andThen(quietFor("2 days"), unreadNudges(ada.client));
    const nudges = yield* Effect.andThen(quietFor("1 days"), nudgesOnceThere(ada.client, ONE));

    expect(early).toStrictEqual([]);
    expect(nudges).toMatchObject([{ kind: "first", raisedAt: later(answered.createdAt, "3 days") }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("closing a thread reads its unread nudge and raises no more, and a closed thread never gets one", () =>
  Effect.gen(function* closingStops() {
    const { ada, open } = yield* closedEarlyAndLater;
    const nudges = yield* Effect.andThen(quietFor("7 days"), nudgesOnceThere(ada.client, TWO));

    expect(Arr.map(nudges, ({ kind, parent }) => ({ kind, thread: parent.id }))).toStrictEqual([
      { kind: "first", thread: open.id },
      { kind: "second", thread: open.id },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "a Deactivated agent's thread nudges its owner, and a Deactivated human's, or their Deactivated agent's, nudges nobody",
  () =>
    Effect.gen(function* deactivated() {
      const { ada, bob, cookout } = yield* board;
      const helper = yield* cookout.createIdentity("ada/helper", { owner: "ada" });
      const agentThread = yield* post(helper, "release notes drafted?");
      yield* post(bob, "who owns the changelog?");
      const scout = yield* cookout.createIdentity("bob/scout", { owner: "bob" });
      yield* post(scout, "who owns the roadmap?");
      yield* Effect.forEach(
        ["ada/helper", "bob/scout", "bob"],
        (name) => answer(() => cookout.client.deactivateIdentity(name)),
        {
          concurrency: 1,
        },
      );
      yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, ONE));
      const nudges = yield* Effect.andThen(quietFor("1 days"), unreadNudges(ada.client));

      expect(Arr.map(nudges, ({ parent }) => ({ author: parent.author.name, thread: parent.id }))).toStrictEqual([
        { author: "ada/helper", thread: agentThread.id },
      ]);
    }).pipe(Effect.provide(testCookout())),
);

it.effect("marking a nudge read, or marking all as read, takes it out of the inbox and keeps it in the history", () =>
  Effect.gen(function* markRead() {
    const { ada, bob } = yield* board;
    yield* Effect.andThen(post(ada, "who owns the release notes?"), post(ada, "who owns the changelog?"));
    const raised = yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, TWO));
    const notBobs = yield* refusal(() => bob.client.markNudgeRead(idOf(raised, OLDEST)));
    const marked = yield* answer(() => ada.client.markNudgeRead(idOf(raised, OLDEST)));
    const left = yield* unreadNudges(ada.client);
    yield* answer(() => ada.client.ackAll({ nudgesUpTo: idOf(raised, NEWEST) }));
    const after = yield* Effect.all([unreadNudges(ada.client), historyNudges(ada.client)], { concurrency: 1 });

    expect([notBobs.code, marked.nudge.read, Arr.map(left, ({ id }) => id)]).toStrictEqual([
      "nudge_not_found",
      true,
      [idOf(raised, NEWEST)],
    ]);
    expect(after).toStrictEqual([
      [],
      [
        { kind: "first", read: true },
        { kind: "first", read: true },
      ],
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a thread quiet since before nudges began gets none until it has new activity", () =>
  Effect.gen(function* beforeNudges() {
    const { ada, bob, cookout } = yield* board;
    const old = yield* cookout.seedMessage({
      author: { name: ada.identity.name },
      channel: channelName("grill"),
      createdAt: BEFORE_NUDGES,
      mentions: [],
      text: "who owns the release notes?",
    });
    const none = yield* Effect.andThen(quietFor("10 days"), unreadNudges(ada.client));
    yield* reply(bob, old);
    const nudges = yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, ONE));

    expect(none).toStrictEqual([]);
    expect(Arr.map(nudges, ({ parent }) => parent.id)).toStrictEqual([old.id]);
  }).pipe(Effect.provide(testCookout())),
);

import { Array as Arr, Effect, Option } from "effect";
import type { CookoutClient, Message, Nudge, NudgeId } from "../../index.ts";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import type { TestIdentity } from "../../../testing/server.ts";

interface HistoryEntry {
  readonly kind: string;
  readonly read: boolean;
}

const HUMAN = { kind: "human" } as const;
const OLDEST = 0;
const ONE = 1;
const TWO = 2;
const SETTLE = "30 millis";

const board = Effect.gen(function* openBoard() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", HUMAN);
  const bob = yield* cookout.createIdentity("bob", HUMAN);
  yield* answer(() => ada.client.createChannel({ name: "grill" }));
  return { ada, bob };
});

function post(who: TestIdentity, text: string): Effect.Effect<Message> {
  return Effect.map(
    Effect.andThen(
      TestClock.adjust("1 millis"),
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

function quietFor(wait: `${number} days`): Effect.Effect<void> {
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

function idOf(nudges: readonly Nudge[], index: number): NudgeId {
  return Option.getOrThrow(Option.map(Arr.get(nudges, index), ({ id }) => id));
}

it.effect("a follow-up reply takes the nudge out of the inbox and the history, and starts the cycle again", () =>
  Effect.gen(function* replyMeets() {
    const { ada } = yield* board;
    const thread = yield* post(ada, "who owns the release notes?");
    yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, ONE));
    const afterReply = yield* Effect.andThen(
      reply(ada, thread),
      Effect.all([unreadNudges(ada.client), historyNudges(ada.client)], { concurrency: 1 }),
    );
    const again = yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, ONE));
    const history = yield* historyNudges(ada.client);

    expect([afterReply, Arr.map(again, ({ kind }) => kind)]).toStrictEqual([[[], []], ["first"]]);
    expect(history).toStrictEqual([{ kind: "first", read: false }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("closing a nudged thread takes its nudge out of the history too, read or not, until it is quiet again", () =>
  Effect.gen(function* closingMeets() {
    const { ada, bob } = yield* board;
    const read = yield* post(ada, "who owns the release notes?");
    const unread = yield* post(ada, "who owns the changelog?");
    const raised = yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, TWO));
    yield* Effect.all(
      [
        answer(() => ada.client.markNudgeRead(idOf(raised, OLDEST))),
        answer(() => ada.client.closeThread(read.id)),
        answer(() => bob.client.closeThread(unread.id)),
      ],
      { concurrency: 1 },
    );
    const afterClose = yield* Effect.all([unreadNudges(ada.client), historyNudges(ada.client)], { concurrency: 1 });
    yield* answer(() => bob.client.reopenThread(unread.id));
    const again = yield* Effect.andThen(quietFor("3 days"), nudgesOnceThere(ada.client, ONE));

    expect(afterClose).toStrictEqual([[], []]);
    expect(Arr.map(again, ({ kind, parent }) => ({ kind, thread: parent.id }))).toStrictEqual([
      { kind: "first", thread: unread.id },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

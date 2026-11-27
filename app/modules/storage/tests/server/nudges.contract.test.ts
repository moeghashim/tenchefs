import { Array as Arr, DateTime, Effect, Option, String as Str } from "effect";
import type { Message, MessageId } from "../../../messages/index.ts";
import type { NewMessage, Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  identityFixture,
  identityName,
  isoTime,
  newMessageFixture,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import type { NudgeId } from "../../../inbox/index.ts";
import { TestClock } from "effect/testing";
import { nudgeIntervals } from "../../../inbox/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const ADA = identityName("ada");
const BOB = identityName("bob");
const HASH_LENGTH = 64;
const MONDAY = isoTime("2026-01-05T00:00:00.000Z");
const TUESDAY = isoTime("2026-01-06T00:00:00.000Z");
const THURSDAY = isoTime("2026-01-08T00:00:00.000Z");
const FRIDAY = isoTime("2026-01-09T00:00:00.000Z");
const SATURDAY = isoTime("2026-01-10T00:00:00.000Z");
const NEXT_MONDAY = isoTime("2026-01-12T00:00:00.000Z");
const MONDAY_AFTER = isoTime("2026-01-19T00:00:00.000Z");
const MONTH_LATER = isoTime("2026-02-20T00:00:00.000Z");
const BY_ADA = { author: { name: "ada" } } as const;
const OLDEST = 0;
const MIDDLE = 1;
const NEWEST = 2;
const SECOND_DUE = isoTime("2026-01-16T00:00:00.000Z");

interface Grill {
  readonly storage: Storage["Service"];
  readonly post: (at: NewMessage["createdAt"], text: string) => Effect.Effect<Message>;
  readonly reply: (at: NewMessage["createdAt"], parent: MessageId) => Effect.Effect<Message>;
}

function grill<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Grill, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* openGrill() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* storage.createIdentity(identityFixture("ada", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("a")));
    yield* storage.createIdentity(identityFixture("bob", { kind: "human" }), tokenHash(Str.repeat(HASH_LENGTH)("b")));
    const append = appendTo(storage);
    return {
      post: (at, text) => append({ ...newMessageFixture("grill", text, BY_ADA), createdAt: at }),
      reply: (at, parent) =>
        append({ ...newMessageFixture("grill", "reply", { author: { name: "bob" }, replyTo: parent }), createdAt: at }),
      storage,
    };
  });
}

function idAt(raised: readonly { readonly id: NudgeId }[], index: number): NudgeId {
  return Option.getOrThrow(Option.map(Arr.get(raised, index), ({ id }) => id));
}

function threeIds(raised: readonly { readonly id: NudgeId }[]): readonly [NudgeId, NudgeId, NudgeId] {
  return [idAt(raised, OLDEST), idAt(raised, MIDDLE), idAt(raised, NEWEST)];
}

interface ReadState {
  readonly id: NudgeId;
  readonly read: boolean;
}

function readStates(nudges: readonly ReadState[]): readonly ReadState[] {
  return Arr.map(nudges, ({ id, read }) => ({ id, read }));
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): the next nudge is due 3 days after the last activity of an open thread",
  ({ layer }) =>
    Effect.gen(function* nextDue() {
      const { post, reply, storage } = yield* grill(layer);
      const quiet = yield* post(MONDAY, "quiet");
      const closed = yield* post(MONDAY, "closed");
      const before = yield* storage.nextNudgeDue(nudgeIntervals);
      yield* reply(TUESDAY, quiet.id);
      yield* storage.closeThread(closed.id, { closedAt: TUESDAY, closedBy: ADA });
      const after = yield* storage.nextNudgeDue(nudgeIntervals);

      expect([before, after]).toStrictEqual([THURSDAY, FRIDAY]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a due nudge is raised once for the starter, and the second falls due 7 days on",
  ({ layer }) =>
    Effect.gen(function* raiseOnce() {
      const { post, storage } = yield* grill(layer);
      const quiet = yield* post(MONDAY, "quiet");
      const early = yield* storage.raiseDueNudges(TUESDAY, nudgeIntervals);
      const first = yield* storage.raiseDueNudges(FRIDAY, nudgeIntervals);
      const again = yield* storage.raiseDueNudges(FRIDAY, nudgeIntervals);
      const secondDue = yield* storage.nextNudgeDue(nudgeIntervals);

      expect([early, again, secondDue]).toStrictEqual([[], [], SECOND_DUE]);
      expect(first).toMatchObject([
        { kind: "first", parent: { id: quiet.id }, raisedAt: FRIDAY, read: false, recipient: ADA },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): after the second nudge none is due until new activity",
  ({ layer }) =>
    Effect.gen(function* noThird() {
      const { post, storage } = yield* grill(layer);
      yield* post(MONDAY, "quiet");
      yield* storage.raiseDueNudges(FRIDAY, nudgeIntervals);
      const second = yield* storage.raiseDueNudges(MONTH_LATER, nudgeIntervals);
      const thirdDue = yield* storage.nextNudgeDue(nudgeIntervals);

      expect(second).toMatchObject([{ kind: "second", raisedAt: MONTH_LATER, recipient: ADA }]);
      expect(thirdDue).toBeNull();
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): nudges are listed per recipient, and read one at a time or up to one, which names those it read",
  ({ layer }) =>
    Effect.gen(function* listAndRead() {
      const { post, storage } = yield* grill(layer);
      yield* Effect.forEach(["first", "second", "third"], (text) => post(MONDAY, text), { concurrency: 1 });
      const [oldest, middle, newest] = yield* Effect.map(storage.raiseDueNudges(FRIDAY, nudgeIntervals), threeIds);
      const others = yield* Effect.all([storage.listNudges(BOB, "all"), storage.markNudgeRead(BOB, oldest)], {
        concurrency: 1,
      });
      const marked = yield* Effect.map(storage.markNudgeRead(ADA, oldest), (nudge) =>
        Option.exists(Option.fromNullishOr(nudge), ({ read }) => read),
      );
      const readUpTo = yield* storage.markNudgesReadUpTo(ADA, middle);
      const unread = yield* storage.listNudges(ADA, "unread");
      const all = yield* storage.listNudges(ADA, "all");

      expect([others, marked, readUpTo, readStates(unread)]).toStrictEqual([
        [[], null],
        true,
        [middle],
        [{ id: newest, read: false }],
      ]);
      expect(readStates(all)).toStrictEqual([
        { id: oldest, read: true },
        { id: middle, read: true },
        { id: newest, read: false },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a reply, a close or a reopen takes a thread's nudge out of the listing, read or not",
  ({ layer }) =>
    Effect.gen(function* goneByActivity() {
      const { post, reply, storage } = yield* grill(layer);
      const replied = yield* post(MONDAY, "replied");
      const closed = yield* post(MONDAY, "closed");
      const reopened = yield* post(MONDAY, "reopened");
      const raised = yield* storage.raiseDueNudges(FRIDAY, nudgeIntervals);
      yield* Effect.all(
        [
          storage.markNudgeRead(ADA, idAt(raised, MIDDLE)),
          reply(SATURDAY, replied.id),
          storage.closeThread(closed.id, { closedAt: SATURDAY, closedBy: BOB }),
          storage.closeThread(reopened.id, { closedAt: SATURDAY, closedBy: BOB }),
          storage.reopenThread(reopened.id, NEXT_MONDAY),
        ],
        { concurrency: 1 },
      );
      const [unread, all, due] = yield* Effect.all(
        [storage.listNudges(ADA, "unread"), storage.listNudges(ADA, "all"), storage.nextNudgeDue(nudgeIntervals)],
        { concurrency: 1 },
      );

      expect([unread, all]).toStrictEqual([[], []]);
      expect(due).toBe(isoTime("2026-01-13T00:00:00.000Z"));
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a thread quiet since before nudges began gets none until it has new activity",
  ({ layer }) =>
    Effect.gen(function* beforeNudges() {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe(SATURDAY)));
      const { post, reply, storage } = yield* grill(layer);
      const old = yield* post(MONDAY, "old");
      const none = yield* storage.nextNudgeDue(nudgeIntervals);
      const raised = yield* storage.raiseDueNudges(MONDAY_AFTER, nudgeIntervals);
      yield* reply(NEXT_MONDAY, old.id);
      const due = yield* storage.nextNudgeDue(nudgeIntervals);

      expect([none, raised, due]).toStrictEqual([null, [], isoTime("2026-01-15T00:00:00.000Z")]);
    }),
);

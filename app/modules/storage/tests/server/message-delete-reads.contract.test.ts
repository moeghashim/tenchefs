import { Array as Arr, Effect, Option, Predicate, String as Str, pipe } from "effect";
import type { Attachment, AttachmentId } from "../../../attachments/index.ts";
import type { Message, MessageId } from "../../../messages/index.ts";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  channelFixture as channel,
  channelName,
  fixtureTime,
  identityFixture as identity,
  isoTime,
  identityName as nameOf,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Layer } from "effect";
import { isAttachmentId } from "../../../attachments/index.ts";
import { nudgeIntervals } from "../../../inbox/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const FILE_SIZE = 1;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const PAGE = { limit: 50 } as const;
const OPEN = { all: true, limit: 50 } as const;
const MONTH_LATER = isoTime("2026-02-01T00:00:00.000Z");
const ANN = { author: { name: "ann" } } as const;
const BOB = { author: { name: "bob" } } as const;
const GRILLED = { authors: [], channels: [], words: ["grilled"] };
const deleting = { deletedAt: isoTime("2026-01-05T00:00:00.000Z"), deletedBy: nameOf("ann") };
const PEOPLE = [
  ["ann", "a"],
  ["bob", "b"],
] as const;

type Store = Storage["Service"];
type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

function attachmentId(raw: string): AttachmentId {
  return Option.getOrThrow(Option.liftPredicate(raw, isAttachmentId));
}

function file(name: string): Attachment {
  return { contentType: "application/octet-stream", id: attachmentId(name), image: false, name, size: FILE_SIZE };
}

function storeWithPeople<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<Store, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* openWithPeople() {
    const { storage } = yield* openStore(layer);
    yield* storage.createChannel(channel("grill"));
    yield* pipe(
      PEOPLE,
      Effect.forEach(
        ([name, letter]) => storage.createIdentity(identity(name), tokenHash(Str.repeat(HASH_LENGTH)(letter))),
        ONE_AT_A_TIME,
      ),
    );
    yield* storage.subscribeChannel(nameOf("bob"), channelName("grill"));
    return storage;
  });
}

interface Board {
  readonly doomed: Message;
  readonly kept: Message;
}

function fill(storage: Store): Fails<Board> {
  return Effect.gen(function* fillBoard() {
    const doomed = yield* appendTo(storage)({
      ...newMessage("grill", "@bob grilled corn", { ...ANN, mentions: ["bob"] }),
      attachments: [file("doomed")],
    });
    yield* appendTo(storage)({
      ...newMessage("grill", "grilled reply", { ...BOB, replyTo: doomed.id }),
      attachments: [file("reply")],
    });
    yield* appendTo(storage)(newMessage("grill", "grilled thanks", { ...ANN, replyTo: doomed.id }));
    const kept = yield* appendTo(storage)(newMessage("grill", "grilled kept", ANN));
    yield* storage.addReaction({
      identity: nameOf("bob"),
      messageId: doomed.id,
      notifiesAuthor: true,
      reactedAt: fixtureTime,
      reaction: "thumbs_up",
    });
    yield* storage.ackMessage(nameOf("bob"), doomed.id, fixtureTime);
    yield* storage.moveReadPositionBack(nameOf("bob"), doomed.id);
    return { doomed, kept };
  });
}

function idsOf(items: readonly { readonly message: Message }[]): readonly MessageId[] {
  return Arr.dedupe(Arr.map(items, ({ message }) => message.id));
}

function messageIdsOf(records: readonly { readonly messageId: MessageId }[]): readonly MessageId[] {
  return Arr.map(records, ({ messageId }) => messageId);
}

function historyOf(storage: Store, name: string): Fails<readonly MessageId[]> {
  return Effect.map(storage.listInboxHistory(nameOf(name), PAGE), ({ items }) => idsOf(items));
}

function searched(storage: Store): Fails<readonly MessageId[]> {
  return Effect.map(storage.searchMessages(GRILLED, PAGE), ({ results }) => idsOf(results));
}

function attachmentFound(storage: Store, name: string): Fails<boolean> {
  return Effect.map(storage.findAttachment(attachmentId(name)), Predicate.isNotUndefined);
}

function attachmentsFound(storage: Store, names: readonly string[]): Fails<readonly boolean[]> {
  return Effect.forEach(names, (name) => attachmentFound(storage, name), ONE_AT_A_TIME);
}

function inboxOf(storage: Store, name: string): Fails<readonly MessageId[]> {
  return Effect.map(storage.listInbox(nameOf(name)), idsOf);
}

function itemFound(storage: Store, id: MessageId): Fails<boolean> {
  return Effect.map(storage.findInboxItem(nameOf("bob"), id), Predicate.isNotUndefined);
}

function reactedTo(storage: Store, id: MessageId): Fails<readonly MessageId[]> {
  return Effect.map(storage.listReactions([id]), messageIdsOf);
}

function receiptsFor(storage: Store, id: MessageId): Fails<readonly MessageId[]> {
  return Effect.map(storage.listReadReceipts([id]), messageIdsOf);
}

function unseenBy(storage: Store, name: string): Fails<readonly MessageId[]> {
  return Effect.map(storage.listUnseenReactions(nameOf(name)), messageIdsOf);
}

function nudgedThreads(storage: Store): Fails<readonly MessageId[]> {
  return Effect.map(
    storage.listNudges(nameOf("ann"), "all"),
    Arr.map(({ parent }) => parent.id),
  );
}

function openThreads(storage: Store): Fails<readonly MessageId[]> {
  return Effect.map(storage.listOpenThreads(nameOf("ann"), OPEN), ({ threads }) => idsOf(threads));
}

interface Reads {
  readonly annHistory: readonly MessageId[];
  readonly attachments: readonly boolean[];
  readonly bobHistory: readonly MessageId[];
  readonly bobInbox: readonly MessageId[];
  readonly found: boolean;
  readonly nudges: readonly MessageId[];
  readonly open: readonly MessageId[];
  readonly reactions: readonly MessageId[];
  readonly receipts: readonly MessageId[];
  readonly search: readonly MessageId[];
  readonly unseen: readonly MessageId[];
}

function readsOf(storage: Store, { doomed }: Board): Fails<Reads> {
  return Effect.all(
    {
      annHistory: historyOf(storage, "ann"),
      attachments: attachmentsFound(storage, ["doomed", "reply"]),
      bobHistory: historyOf(storage, "bob"),
      bobInbox: inboxOf(storage, "bob"),
      found: itemFound(storage, doomed.id),
      nudges: nudgedThreads(storage),
      open: openThreads(storage),
      reactions: reactedTo(storage, doomed.id),
      receipts: receiptsFor(storage, doomed.id),
      search: searched(storage),
      unseen: unseenBy(storage, "ann"),
    },
    ONE_AT_A_TIME,
  );
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a deleted thread leaves the Inbox and its history, Nudges, search, open threads, receipts, Reactions and Attachments",
  ({ layer }) =>
    Effect.gen(function* deletedThreadReads() {
      const storage = yield* storeWithPeople(layer);
      const board = yield* fill(storage);
      yield* storage.raiseDueNudges(MONTH_LATER, nudgeIntervals);
      const before = yield* readsOf(storage, board);
      yield* storage.deleteMessage(board.doomed.id, deleting);
      const after = yield* readsOf(storage, board);
      const { doomed, kept } = board;

      expect(
        Arr.every(
          [before.annHistory, before.bobInbox, before.nudges, before.open, before.search],
          Arr.contains(doomed.id),
        ),
      ).toBe(true);
      expect(before).toMatchObject({
        attachments: [true, true],
        found: true,
        reactions: [doomed.id],
        receipts: [doomed.id],
        unseen: [doomed.id],
      });
      expect(after).toStrictEqual({
        annHistory: [],
        attachments: [false, false],
        bobHistory: [kept.id],
        bobInbox: [kept.id],
        found: false,
        nudges: [kept.id],
        open: [kept.id],
        reactions: [],
        receipts: [],
        search: [kept.id],
        unseen: [],
      });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a deleted reply leaves the Inbox, search and Attachments, and the rest of its thread stays",
  ({ layer }) =>
    Effect.gen(function* deletedReplyReads() {
      const storage = yield* storeWithPeople(layer);
      const { doomed } = yield* fill(storage);
      const late = yield* appendTo(storage)({
        ...newMessage("grill", "grilled late", { ...BOB, replyTo: doomed.id }),
        attachments: [file("late")],
      });
      const before = yield* inboxOf(storage, "ann");
      yield* storage.deleteMessage(late.id, deleting);
      const after = yield* Effect.all(
        {
          annInbox: inboxOf(storage, "ann"),
          attachments: attachmentsFound(storage, ["late", "doomed"]),
          search: searched(storage),
        },
        ONE_AT_A_TIME,
      );

      expect(before).toContain(late.id);
      expect({ ...after, search: Arr.contains(after.search, late.id) }).toStrictEqual({
        annInbox: Arr.filter(before, (id) => id !== late.id),
        attachments: [false, true],
        search: false,
      });
      expect(after.search).toContain(doomed.id);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): reacting to, unreacting, acking or moving back to a deleted message finds no message",
  ({ layer }) =>
    Effect.gen(function* actOnDeleted() {
      const storage = yield* storeWithPeople(layer);
      const { doomed } = yield* fill(storage);
      yield* storage.deleteMessage(doomed.id, deleting);
      const key = { identity: nameOf("bob"), messageId: doomed.id, reaction: "thumbs_up" } as const;
      const acted = yield* Effect.all(
        [
          storage.addReaction({ ...key, notifiesAuthor: true, reactedAt: fixtureTime }),
          storage.removeReaction(key),
          storage.ackMessage(nameOf("bob"), doomed.id, fixtureTime),
          storage.moveReadPositionBack(nameOf("bob"), doomed.id),
        ],
        ONE_AT_A_TIME,
      );

      expect(Arr.every(acted, Predicate.isUndefined)).toBe(true);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an ack that passes a deleted mention records no read receipt for it",
  ({ layer }) =>
    Effect.gen(function* ackPastDeleted() {
      const storage = yield* storeWithPeople(layer);
      const doomed = yield* appendTo(storage)(newMessage("grill", "@bob first", { ...ANN, mentions: ["bob"] }));
      const later = yield* appendTo(storage)(newMessage("grill", "@bob later", { ...ANN, mentions: ["bob"] }));
      yield* storage.deleteMessage(doomed.id, deleting);
      const acked = yield* storage.ackMessage(nameOf("bob"), later.id, fixtureTime);

      expect(Option.map(Option.fromUndefinedOr(acked), ({ receipts }) => messageIdsOf(receipts))).toStrictEqual(
        Option.some([later.id]),
      );
    }),
);

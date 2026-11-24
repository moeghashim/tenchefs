import { Array as Arr, Effect, Predicate, String as Str } from "effect";
import type { Storage, StorageUnavailable } from "../../../storage/server.ts";
import {
  appendTo,
  callId,
  channelFixture as channel,
  channelName,
  commandFixture as command,
  commandName,
  fixtureTime,
  handlerFixture as handler,
  identityFixture as identity,
  isoTime,
  identityName as nameOf,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Message } from "../../../messages/index.ts";
import { nudgeIntervals } from "../../../inbox/index.ts";
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const commandHash = tokenHash(Str.repeat(HASH_LENGTH)("c"));
const startedAt = isoTime("2026-01-01T00:00:00.000Z");
const expiresAt = isoTime("2026-01-02T00:00:00.000Z");
const ANN = { author: { name: "ann" } } as const;
const BOB = { author: { name: "bob" } } as const;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const PAGE = { limit: 50 } as const;
const MONTH_LATER = isoTime("2026-02-01T00:00:00.000Z");

interface Filled {
  readonly mention: Message;
  readonly elsewhere: Message;
}

function setUp(storage: Storage["Service"]): Effect.Effect<void, StorageUnavailable> {
  return Effect.all(
    [
      storage.createIdentity(identity("ann"), hashA),
      storage.createIdentity(identity("bob"), hashB),
      storage.addCommand(command("deploy"), handler("deploy")),
      storage.createChannel(channel("grill", { description: "Grill it" })),
      storage.createChannel(channel("lounge")),
      storage.subscribeChannel(nameOf("bob"), channelName("grill")),
      storage.subscribeChannel(nameOf("bob"), channelName("lounge")),
    ],
    { ...ONE_AT_A_TIME, discard: true },
  );
}

function callDeploy(storage: Storage["Service"]): Effect.Effect<unknown, StorageUnavailable> {
  return storage.appendCommandCall({
    delivery: {
      attempts: 0,
      callId: callId("call_1"),
      command: commandName("deploy"),
      data: { branch: "main" },
      nextAttemptAt: startedAt,
      outcome: "pending",
    },
    message: newMessage("grill", "/deploy", { ...ANN, data: { command: "deploy", data: { branch: "main" } } }),
    token: { expiresAt, handler: nameOf("deploy"), hash: commandHash },
  });
}

function fillGrill(storage: Storage["Service"]): Effect.Effect<Filled, StorageUnavailable> {
  return Effect.gen(function* fill() {
    yield* setUp(storage);
    const mention = yield* appendTo(storage)(newMessage("grill", "@bob look", { ...ANN, mentions: ["bob"] }));
    yield* appendTo(storage)(newMessage("grill", "on it", { ...BOB, replyTo: mention.id }));
    yield* appendTo(storage)(newMessage("grill", "thanks", { ...ANN, replyTo: mention.id }));
    yield* storage.ackMessage(nameOf("bob"), mention.id, fixtureTime);
    yield* callDeploy(storage);
    const elsewhere = yield* appendTo(storage)(newMessage("lounge", "hello", ANN));
    return { elsewhere, mention };
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting a channel removes it and everything in it, and nothing else",
  ({ layer }) =>
    Effect.gen(function* deleteChannel() {
      const { storage } = yield* openStore(layer);
      const { elsewhere, mention } = yield* fillGrill(storage);
      const latest = yield* storage.latestMessageId;
      const deleted = yield* storage.deleteChannel(channelName("grill"));
      const after = yield* Effect.all(
        {
          channels: storage.listChannels(),
          grantGone: Effect.map(storage.findCommandToken(commandHash), Predicate.isUndefined),
          inbox: storage.listInbox(nameOf("bob")),
          latest: storage.latestMessageId,
          pending: storage.listPendingDeliveries,
          threadGone: Effect.map(storage.getThread(mention.id), Predicate.isUndefined),
        },
        ONE_AT_A_TIME,
      );

      expect(deleted).toStrictEqual({ attachments: [], channel: channel("grill", { description: "Grill it" }) });
      expect(after).toStrictEqual({
        channels: [channel("lounge")],
        grantGone: true,
        inbox: [{ message: elsewhere, parent: elsewhere, reasons: ["subscribed-channel"] }],
        latest,
        pending: [],
        threadGone: true,
      });
    }),
);

it.effect.each(storageLayers)("storage contract ($adapter): deleting a missing channel returns nothing", ({ layer }) =>
  Effect.gen(function* deleteMissing() {
    const { storage } = yield* openStore(layer);
    const deleted = yield* storage.deleteChannel(channelName("nowhere"));

    expect(deleted).toBeUndefined();
  }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a deleted channel's name can be created again, as a new, empty channel",
  ({ layer }) =>
    Effect.gen(function* createAgain() {
      const { storage } = yield* openStore(layer);
      const { elsewhere } = yield* fillGrill(storage);
      yield* storage.deleteChannel(channelName("grill"));
      const created = yield* storage.createChannel(channel("grill"));
      const page = yield* storage.listChannelMessages(channelName("grill"), PAGE);
      const fresh = yield* appendTo(storage)(newMessage("grill", "new start", ANN));
      const inbox = yield* storage.listInbox(nameOf("bob"));

      expect([created, page]).toStrictEqual(["created", { hasMore: false, messages: [] }]);
      expect(fresh.id).toBeGreaterThan(elsewhere.id);
      expect(inbox).toMatchObject([{ message: { id: elsewhere.id } }]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting a channel takes its messages out of everyone's Inbox, its history and Nudges",
  ({ layer }) =>
    Effect.gen(function* deleteChannelInbox() {
      const { storage } = yield* openStore(layer);
      const { elsewhere, mention } = yield* fillGrill(storage);
      yield* storage.raiseDueNudges(MONTH_LATER, nudgeIntervals);
      const before = yield* Effect.all(
        {
          history: storage.listInboxHistory(nameOf("bob"), PAGE),
          nudges: storage.listNudges(nameOf("ann"), "all"),
        },
        ONE_AT_A_TIME,
      );
      yield* storage.deleteChannel(channelName("grill"));
      const after = yield* Effect.all(
        {
          annInbox: storage.listInbox(nameOf("ann")),
          bobInbox: storage.listInbox(nameOf("bob")),
          history: storage.listInboxHistory(nameOf("bob"), PAGE),
          nudges: storage.listNudges(nameOf("ann"), "all"),
        },
        ONE_AT_A_TIME,
      );

      expect([
        Arr.some(before.history.items, ({ message }) => message.id === mention.id),
        Arr.some(before.nudges, ({ parent }) => parent.id === mention.id),
      ]).toStrictEqual([true, true]);
      expect({
        annInbox: after.annInbox,
        bobInbox: Arr.map(after.bobInbox, ({ message }) => message.id),
        history: Arr.map(after.history.items, ({ message }) => message.id),
        nudges: Arr.map(after.nudges, ({ parent }) => parent.id),
      }).toStrictEqual({
        annInbox: [],
        bobInbox: [elsewhere.id],
        history: [elsewhere.id],
        nudges: [elsewhere.id],
      });
    }),
);

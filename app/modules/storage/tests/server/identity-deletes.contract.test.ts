import { Effect, Predicate, String as Str } from "effect";
import {
  appendTo,
  callId,
  channelFixture as channel,
  webhookCommandFixture as command,
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
import { tokenHash } from "../../../identities/index.ts";

const HASH_LENGTH = 64;
const hashA = tokenHash(Str.repeat(HASH_LENGTH)("a"));
const hashB = tokenHash(Str.repeat(HASH_LENGTH)("b"));
const hashC = tokenHash(Str.repeat(HASH_LENGTH)("c"));
const hashD = tokenHash(Str.repeat(HASH_LENGTH)("d"));
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const T0 = isoTime("2026-01-01T00:00:00.000Z");
const T30 = isoTime("2026-01-01T00:00:30.000Z");
const T60 = isoTime("2026-01-01T00:01:00.000Z");
const IDLE_SECONDS = 60;
const ONE = 1;
const PAGE = { limit: 10 } as const;
const BOT = nameOf("e2e-bot");
const DELIVERY = {
  attempts: 0,
  callId: callId("call_1"),
  data: { branch: "main" },
  nextAttemptAt: T0,
  outcome: "pending",
} as const;

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting an identity with no messages removes it, its tokens and agent sessions, and frees its name",
  ({ layer }) =>
    Effect.gen(function* deleteIdentity() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("e2e-bot"), hashA);
      yield* storage.issueAgentSession({
        force: false,
        session: { expiresAt: T60, hash: hashB, identity: nameOf("e2e-bot"), idleSeconds: IDLE_SECONDS, issuedAt: T0 },
      });
      const deleted = yield* storage.deleteIdentity(nameOf("e2e-bot"));
      const afterwards = yield* Effect.all(
        [
          Effect.map(storage.findIdentityByName(BOT), Predicate.isUndefined),
          storage.findIdentityByTokenHash(hashA),
          storage.useAgentSession({ hash: hashB, now: T30 }),
        ],
        ONE_AT_A_TIME,
      );
      const created = yield* storage.createIdentity(identity("e2e-bot"), hashC);

      expect(deleted).toStrictEqual({ identity: identity("e2e-bot"), status: "deleted" });
      expect(afterwards).toStrictEqual([true, { status: "unknown" }, { status: "unknown" }]);
      expect(created).toBe("created");
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting an identity drops its read positions, receipts, subscriptions, follows and mentions",
  ({ layer }) =>
    Effect.gen(function* forgetInbox() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      yield* storage.createIdentity(identity("e2e-reader"), hashA);
      const top = yield* appendTo(storage)(newMessage("grill", "hello @e2e-reader", { mentions: ["e2e-reader"] }));
      yield* Effect.all(
        [
          storage.subscribeChannel(nameOf("e2e-reader"), channel("grill").name),
          storage.followThread(nameOf("e2e-reader"), top.id),
          storage.ackMessage(nameOf("e2e-reader"), top.id, fixtureTime),
          storage.deleteIdentity(nameOf("e2e-reader")),
        ],
        ONE_AT_A_TIME,
      );
      yield* storage.createIdentity(identity("e2e-reader"), hashB);
      yield* appendTo(storage)(newMessage("grill", "a reply", { replyTo: top.id }));
      const fresh = yield* Effect.all(
        [
          storage.listReadPositions(nameOf("e2e-reader")),
          storage.listSubscribedChannels(nameOf("e2e-reader")),
          storage.listInbox(nameOf("e2e-reader")),
          storage.listReadReceipts([top.id]),
        ],
        ONE_AT_A_TIME,
      );

      expect(fresh).toStrictEqual([[], [], [], []]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): deleting a command's handler identity removes the command, its deliveries and tokens",
  ({ layer }) =>
    Effect.gen(function* deleteHandler() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      yield* storage.addWebhookCommand(command("deploy"), handler("deploy"));
      yield* storage.appendWebhookCommandCall({
        delivery: { ...DELIVERY, command: command("deploy").command.name },
        message: newMessage("grill", "/deploy", { author: { name: "matt" } }),
        token: { expiresAt: T60, handler: nameOf("deploy"), hash: hashD },
      });
      const deleted = yield* storage.deleteIdentity(nameOf("deploy"));
      const found = yield* Effect.map(
        storage.findWebhookCommand(command("deploy").command.name),
        Predicate.isUndefined,
      );
      const left = yield* Effect.all(
        [
          storage.listWebhookCommands,
          storage.listPendingDeliveries,
          Effect.map(storage.findWebhookCommandToken(hashD), Predicate.isUndefined),
        ],
        ONE_AT_A_TIME,
      );

      expect(deleted).toMatchObject({ identity: { name: "deploy" }, status: "deleted" });
      expect([found, ...left]).toStrictEqual([true, [], [], true]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): an identity that wrote a message, or owned the agent that did, is not deleted",
  ({ layer }) =>
    Effect.gen(function* hasMessages() {
      const { storage } = yield* openStore(layer);
      yield* storage.createChannel(channel("grill"));
      yield* Effect.all(
        [
          storage.createIdentity(identity("ada", { kind: "human" }), hashA),
          storage.createIdentity(identity("bob"), hashB),
        ],
        ONE_AT_A_TIME,
      );
      yield* Effect.forEach(
        [
          newMessage("grill", "mine", { author: { name: "bob" } }),
          newMessage("grill", "old bot", { author: { name: "old-bot", owner: "ada" } }),
        ],
        appendTo(storage),
        ONE_AT_A_TIME,
      );
      const refused = yield* Effect.all(
        [
          storage.countMessagesBy(nameOf("bob")),
          storage.countMessagesBy(nameOf("ada")),
          storage.deleteIdentity(nameOf("bob")),
          storage.deleteIdentity(nameOf("ada")),
        ],
        ONE_AT_A_TIME,
      );
      const kept = yield* storage.findIdentityByTokenHash(hashB);
      const page = yield* storage.listChannelMessages(channel("grill").name, PAGE);

      expect(refused).toStrictEqual([ONE, ONE, { status: "has_messages" }, { status: "has_messages" }]);
      expect(kept).toMatchObject({ identity: { name: "bob" }, status: "active" });
      expect(page).toMatchObject({ messages: [{ text: "mine" }, { text: "old bot" }] });
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a missing identity, the last active admin and a human who owns agents are not deleted",
  ({ layer }) =>
    Effect.gen(function* refusals() {
      const { storage } = yield* openStore(layer);
      yield* storage.createIdentity(identity("boss", { admin: true, kind: "human" }), hashA);
      yield* storage.createIdentity(identity("grace", { kind: "human" }), hashB);
      yield* storage.createIdentity(identity("grace/helper", { owner: "grace" }), hashC);
      yield* storage.createIdentity(identity("grace-bot", { owner: "grace" }), hashD);
      const answers = yield* Effect.all(
        [
          storage.deleteIdentity(nameOf("nobody")),
          storage.deleteIdentity(nameOf("grace")),
          storage.deleteIdentity(nameOf("boss")),
        ],
        ONE_AT_A_TIME,
      );
      const boss = yield* storage.findIdentityByTokenHash(hashA);

      expect(answers).toStrictEqual([
        { status: "not_found" },
        { agents: ["grace-bot", "grace/helper"], status: "owns_agents" },
        { status: "last_admin" },
      ]);
      expect(boss).toMatchObject({ status: "active" });
    }),
);

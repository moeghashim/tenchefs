import { Array as Arr, Effect } from "effect";
import type { Storage, StorageUnavailable, StoredDelivery } from "../../../storage/server.ts";
import {
  appendTo,
  callId,
  channelFixture as channel,
  channelName,
  webhookCommandFixture as command,
  handlerFixture as handler,
  isoTime,
  messageId,
  newMessageFixture as newMessage,
  openStore,
  storageLayers,
  webhookCommandName,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { CallId } from "../../../webhook-commands/index.ts";
import type { Layer } from "effect";
import type { MessageId } from "../../../messages/index.ts";

const ANY_THREAD = 1;
const ONE_ATTEMPT = 1;
const TWO_ATTEMPTS = 2;
const ALL_ATTEMPTS = 6;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const startedAt = isoTime("2026-01-01T00:00:00.000Z");
const retryAt = isoTime("2026-01-01T00:00:10.000Z");

function delivery(id: CallId, threadId: MessageId): StoredDelivery {
  return {
    attempts: 0,
    callId: id,
    calledAt: startedAt,
    channel: channelName("grill"),
    command: webhookCommandName("deploy"),
    data: { branch: "main", tags: ["blue", true, null] },
    nextAttemptAt: startedAt,
    outcome: "pending" as const,
    threadId,
  };
}

interface CalledStore {
  readonly storage: Storage["Service"];
  readonly threadId: MessageId;
}

function storeWithCall<Failure, Needs>(
  layer: Layer.Layer<Storage, Failure, Needs>,
): Effect.Effect<CalledStore, Failure | StorageUnavailable, Needs> {
  return Effect.gen(function* callDeploy() {
    const { storage } = yield* openStore(layer);
    yield* storage.addWebhookCommand(command("deploy"), handler("deploy"));
    yield* storage.createChannel(channel("grill"));
    const call = yield* appendTo(storage)(newMessage("grill", "/deploy"));
    return { storage, threadId: call.id };
  });
}

it.effect.each(storageLayers)(
  "storage contract ($adapter): a new delivery is pending, with its call ID, call and next attempt time",
  ({ layer }) =>
    Effect.gen(function* added() {
      const { storage, threadId } = yield* storeWithCall(layer);
      yield* storage.addDelivery(delivery(callId("call_one"), threadId));
      const pending = yield* storage.listPendingDeliveries;

      expect(pending).toStrictEqual([delivery(callId("call_one"), threadId)]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a failed attempt is recorded, and a delivered or failed delivery is no longer pending",
  ({ layer }) =>
    Effect.gen(function* recorded() {
      const { storage, threadId } = yield* storeWithCall(layer);
      yield* Effect.forEach(
        Arr.map(["call_one", "call_two", "call_three"], callId),
        (id) => storage.addDelivery(delivery(id, threadId)),
        ONE_AT_A_TIME,
      );
      yield* storage.updateDelivery(callId("call_one"), {
        attempts: ONE_ATTEMPT,
        nextAttemptAt: retryAt,
        outcome: "pending",
      });
      yield* storage.updateDelivery(callId("call_two"), {
        attempts: TWO_ATTEMPTS,
        nextAttemptAt: retryAt,
        outcome: "delivered",
      });
      yield* storage.updateDelivery(callId("call_three"), {
        attempts: ALL_ATTEMPTS,
        nextAttemptAt: retryAt,
        outcome: "failed",
      });
      const pending = yield* storage.listPendingDeliveries;

      expect(pending).toStrictEqual([
        { ...delivery(callId("call_one"), threadId), attempts: ONE_ATTEMPT, nextAttemptAt: retryAt },
      ]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): pending deliveries are listed in the order they were added",
  ({ layer }) =>
    Effect.gen(function* ordered() {
      const { storage, threadId } = yield* storeWithCall(layer);
      yield* Effect.forEach(
        Arr.map(["call_b", "call_a", "call_c"], callId),
        (id) => storage.addDelivery(delivery(id, threadId)),
        ONE_AT_A_TIME,
      );
      const pending = yield* storage.listPendingDeliveries;

      expect(Arr.map(pending, (stored) => stored.callId)).toStrictEqual(["call_b", "call_a", "call_c"]);
    }),
);

it.effect.each(storageLayers)(
  "storage contract ($adapter): a closed store can't add, update or list deliveries",
  ({ layer }) =>
    Effect.gen(function* closed() {
      const { close, storage } = yield* openStore(layer);
      yield* close;
      const id = callId("call_one");
      const added = storage.addDelivery(delivery(id, messageId(ANY_THREAD)));
      const updated = storage.updateDelivery(id, { attempts: ONE_ATTEMPT, nextAttemptAt: retryAt, outcome: "pending" });
      const failures = yield* Effect.all(
        [Effect.flip(added), Effect.flip(updated), Effect.flip(storage.listPendingDeliveries)],
        ONE_AT_A_TIME,
      );

      expect(failures).toMatchObject([
        { _tag: "StorageUnavailable" },
        { _tag: "StorageUnavailable" },
        { _tag: "StorageUnavailable" },
      ]);
    }),
);

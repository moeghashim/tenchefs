import type { Connected, StreamRequest } from "./source.ts";
import { Effect, Stream } from "effect";
import { Inbox, OfflineAlerts } from "../../../inbox/server.ts";
import { OfflineAlertEventSchema, SubscriptionEventSchema } from "./wire.ts";
import { TriggerChanges, TriggerEventSchema } from "../../../triggers/server.ts";
import { Channels } from "../../../channels/server.ts";
import type { Identity } from "../../../identities/index.ts";
import type { SubscriptionResponse } from "../../../inbox/index.ts";
import type { TriggerChange } from "../../../triggers/server.ts";
import { broughtInBy } from "../../../identities/server.ts";
import { sseEvent } from "./source.ts";

const subscriptionEvent = sseEvent(SubscriptionEventSchema);
const offlineAlertEvent = sseEvent(OfflineAlertEventSchema);
const triggerEvent = sseEvent(TriggerEventSchema);

function subscriptions({ caller }: StreamRequest): Connected<Inbox | Channels> {
  return Effect.gen(function* subscribeToSubscriptions() {
    const inbox = yield* Inbox;
    const channels = yield* Channels;
    const changed = yield* inbox.subscriptionChanged;
    const created = yield* channels.created;
    const own: Stream.Stream<SubscriptionResponse> = Stream.fromSubscription(changed).pipe(
      Stream.filter(({ identity }) => identity === caller.name),
      Stream.map(({ subscription }) => subscription),
    );
    const createdByCaller: Stream.Stream<SubscriptionResponse> = Stream.fromSubscription(created).pipe(
      Stream.filter(({ creator }) => creator === caller.name),
      Stream.map(({ channel }) => ({ channel: channel.name, subscribed: true })),
    );
    return Stream.merge(own, createdByCaller).pipe(
      Stream.mapEffect((subscription) => subscriptionEvent({ subscription, type: "subscription" })),
    );
  });
}

function offlineAlerts({ caller }: StreamRequest): Connected<OfflineAlerts> {
  return Effect.gen(function* subscribeToOfflineAlerts() {
    const alerts = yield* OfflineAlerts;
    const changed = yield* alerts.changed;
    return Stream.fromSubscription(changed).pipe(
      Stream.filter(({ owner }) => owner === caller.name),
      Stream.mapEffect(({ alert }) => offlineAlertEvent({ alert, type: "offline-alert" })),
    );
  });
}

function readableBy(caller: Identity): (change: TriggerChange) => boolean {
  return ({ agent }) =>
    agent.kind === "agent" && (agent.owner === caller.name || broughtInBy({ caller, target: agent }));
}

function triggers({ caller }: StreamRequest): Connected<TriggerChanges> {
  return Effect.gen(function* subscribeToTriggers() {
    const changes = yield* TriggerChanges;
    const changed = yield* changes.changed;
    return Stream.fromSubscription(changed).pipe(
      Stream.filter(readableBy(caller)),
      Stream.mapEffect(({ agent, trigger }) => triggerEvent({ identity: agent.name, trigger, type: "trigger" })),
    );
  });
}

type TriggerNeeds = TriggerChanges;

export { type TriggerNeeds, offlineAlerts, subscriptions, triggers };

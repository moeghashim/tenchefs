import { Array as Arr, Context, DateTime, Effect, Layer, Option, Predicate, PubSub } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { OfflineAlert, OfflineAlertId, OfflineReason, Presence } from "../../../presence/index.ts";
import { isOfflineAlertId, offlineAlertNotFound } from "../../../presence/index.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Scope } from "effect";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import type { TriggerFailure } from "../../../triggers/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

type Fails<Value> = Effect.Effect<Value, Refusal | StorageUnavailable>;

interface OwnedAlert {
  readonly owner: IdentityName;
  readonly alert: OfflineAlert;
}

interface OfflineAlertsService {
  readonly raise: (agent: IdentityName, offlineReason: OfflineReason) => Effect.Effect<void>;
  readonly backOnline: (agent: IdentityName) => Effect.Effect<void>;
  readonly raiseTriggerFailure: (agent: IdentityName, trigger: TriggerFailure) => Effect.Effect<void>;
  readonly triggerCleared: (agent: IdentityName) => Effect.Effect<void>;
  readonly list: (caller: Identity) => Effect.Effect<readonly OfflineAlert[], StorageUnavailable>;
  readonly markRead: (caller: Identity, asked: string) => Fails<OfflineAlert>;
  readonly markAllRead: (
    caller: Identity,
    upTo: OfflineAlertId,
  ) => Effect.Effect<readonly OfflineAlert[], StorageUnavailable>;
  readonly changed: Effect.Effect<PubSub.Subscription<OwnedAlert>, never, Scope.Scope>;
  readonly warningsFor: (viewer: IdentityName) => Effect.Effect<(presence: Presence) => Presence, StorageUnavailable>;
}

class OfflineAlerts extends Context.Service<OfflineAlerts, OfflineAlertsService>()(
  "@ai-hero/cookout/inbox/lib/server/offline-alerts/OfflineAlerts",
) {}

type Publish = (owner: IdentityName) => (alerts: readonly OfflineAlert[]) => Effect.Effect<void>;

interface On {
  readonly storage: Storage["Service"];
  readonly publish: Publish;
}

const NOT_FOUND = 404;
const FIRST_PARAMETER = 0;
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;

const now: Effect.Effect<IsoTime> = Effect.map(DateTime.now, isoTimeOf);

function alertNotFound(asked: string): Refusal {
  return { code: offlineAlertNotFound, message: `You have no offline alert ${asked}.`, status: NOT_FOUND };
}

function ownerOf(found: Identity | undefined): Option.Option<IdentityName> {
  return Option.flatMap(Option.fromNullishOr(found), (identity) => {
    if (identity.kind === "agent") {
      return Option.some(identity.owner);
    }
    return Option.none();
  });
}

function ownerOfAgent(storage: Storage["Service"], agent: IdentityName): Effect.Effect<Option.Option<IdentityName>> {
  return storage.findIdentityByName(agent).pipe(Effect.map(ownerOf), Effect.orElseSucceed(Option.none));
}

type Raising = Pick<NewOfflineAlert, "agent" | "offlineReason" | "trigger">;

type NewOfflineAlert = Parameters<Storage["Service"]["recordOfflineAlert"]>[typeof FIRST_PARAMETER];

function raised({ publish, storage }: On, raising: Raising): Effect.Effect<void> {
  return Effect.gen(function* raiseAlert() {
    const owner = yield* ownerOfAgent(storage, raising.agent);
    if (Option.isNone(owner)) {
      return;
    }
    const raisedAt = yield* now;
    const alert = yield* storage.recordOfflineAlert({ ...raising, owner: owner.value, raisedAt });
    yield* publish(owner.value)([alert]);
  }).pipe(Effect.ignore);
}

type MarkBack = Storage["Service"]["markBackOnline"];

function wasBack({ publish, storage }: On, agent: IdentityName, markBack: MarkBack): Effect.Effect<void> {
  return Effect.gen(function* markBackOnline() {
    const owner = yield* ownerOfAgent(storage, agent);
    const at = yield* now;
    const back = yield* markBack(agent, at);
    yield* Effect.forEach(Option.toArray(owner), (named) => publish(named)(back), ONE_AT_A_TIME);
  }).pipe(Effect.ignore);
}

function markedRead({ publish, storage }: On, caller: Identity, asked: string): Fails<OfflineAlert> {
  return Effect.gen(function* markOneRead() {
    const notFound = alertNotFound(asked);
    const named = Option.liftPredicate(Number(asked), isOfflineAlertId);
    const id = yield* Effect.mapError(Effect.fromOption(named), () => notFound);
    const marked = yield* storage.markOfflineAlertRead(caller.name, id);
    const alert = yield* Effect.mapError(Effect.fromNullishOr(marked), () => notFound);
    yield* publish(caller.name)([alert]);
    return alert;
  });
}

function warnedAgents(alerts: readonly OfflineAlert[]): ReadonlySet<IdentityName> {
  const stillOffline = Arr.filter(alerts, ({ backOnlineAt }) => Predicate.isUndefined(backOnlineAt));
  return new Set(Arr.map(stillOffline, ({ agent }) => agent));
}

function warnedIn(warned: ReadonlySet<IdentityName>): (presence: Presence) => Presence {
  return (presence) => {
    if (presence.online || !warned.has(presence.identity)) {
      return presence;
    }
    return { ...presence, warning: true };
  };
}

function warnings(
  storage: Storage["Service"],
  viewer: IdentityName,
): Effect.Effect<(presence: Presence) => Presence, StorageUnavailable> {
  return Effect.map(storage.listOfflineAlerts(viewer), (alerts) => warnedIn(warnedAgents(alerts)));
}

function publisher(publishOne: (owned: OwnedAlert) => Effect.Effect<boolean>): Publish {
  return (owner) => (alerts) => Effect.forEach(alerts, (alert) => publishOne({ alert, owner }), ONE_AT_A_TIME);
}

const offlineAlertsLayer: Layer.Layer<OfflineAlerts, never, Storage> = Layer.effect(
  OfflineAlerts,
  Effect.gen(function* openOfflineAlerts() {
    const storage = yield* Storage;
    const hub = yield* PubSub.unbounded<OwnedAlert>();
    const on = { publish: publisher((owned) => PubSub.publish(hub, owned)), storage };
    return {
      backOnline: (agent) => wasBack(on, agent, storage.markBackOnline),
      changed: PubSub.subscribe(hub),
      list: (caller) => storage.listOfflineAlerts(caller.name),
      markAllRead: (caller, upTo) =>
        Effect.tap(storage.markOfflineAlertsRead(caller.name, upTo), on.publish(caller.name)),
      markRead: (caller, asked) => markedRead(on, caller, asked),
      raise: (agent, offlineReason) => raised(on, { agent, offlineReason }),
      raiseTriggerFailure: (agent, trigger) => raised(on, { agent, offlineReason: "trigger failed", trigger }),
      triggerCleared: (agent) => wasBack(on, agent, storage.markTriggerAlertsCleared),
      warningsFor: (viewer) => warnings(storage, viewer),
    } satisfies OfflineAlertsService;
  }),
);

function unread(alerts: readonly OfflineAlert[]): readonly OfflineAlert[] {
  return Arr.filter(alerts, ({ read }) => !read);
}

export { OfflineAlerts, offlineAlertsLayer, unread };

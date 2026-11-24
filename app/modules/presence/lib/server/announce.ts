import type { BookState, End } from "./book.ts";
import { DateTime, Effect, Option, Predicate, PubSub } from "effect";
import { DeactivationOffers, OfflineAlerts } from "../../../inbox/server.ts";
import type { OfflineReason, Presence } from "../../index.ts";
import type { Storage, StoredPresence } from "../../../storage/server.ts";
import { endIn, presenceIn } from "./book.ts";
import { reachKey, reachablePresenceIn } from "./reach.ts";
import type { IsoTime } from "../../../time/index.ts";
import { isoTimeOf } from "../../../time/server.ts";

type IdentityName = Presence["identity"];

interface Turn {
  readonly alerts: OfflineAlerts["Service"];
  readonly was: Presence;
  readonly is: Presence;
  readonly end: End | undefined;
  readonly wentOffline: boolean;
}

function unexpectedReason({ end, is, was, wentOffline }: Turn): Option.Option<OfflineReason> {
  if (!was.online || is.online || !wentOffline) {
    return Option.none();
  }
  return Option.fromNullishOr(end).pipe(
    Option.filter(({ unexpected }) => unexpected),
    Option.flatMap(({ offlineReason }) => Option.fromNullishOr(offlineReason)),
  );
}

function alerting(turn: Turn): Effect.Effect<void> {
  if (!turn.was.online && turn.is.online) {
    return turn.alerts.backOnline(turn.is.identity);
  }
  return Option.match(unexpectedReason(turn), {
    onNone: () => Effect.void,
    onSome: (reason) => turn.alerts.raise(turn.is.identity, reason),
  });
}

interface Announce {
  readonly record: (presence: StoredPresence) => Effect.Effect<void>;
  readonly publish: (presence: Presence) => Effect.Effect<void>;
  readonly alerts: OfflineAlerts["Service"];
}

interface Change {
  readonly before: BookState;
  readonly after: BookState;
  readonly identity: IdentityName;
}

const now: Effect.Effect<IsoTime> = Effect.map(DateTime.now, isoTimeOf);

function connectionKey(connection: Presence["connection"]): string {
  if (Predicate.isUndefined(connection)) {
    return "";
  }
  if (connection.via === "web") {
    return "web";
  }
  return `watch ${connection.host ?? ""}`;
}

function samePresence(left: Presence, right: Presence): boolean {
  return (
    left.online === right.online &&
    left.lastSeenAt === right.lastSeenAt &&
    left.offlineReason === right.offlineReason &&
    connectionKey(left.connection) === connectionKey(right.connection) &&
    reachKey(left) === reachKey(right)
  );
}

function lastSeenOf(presence: Presence): Effect.Effect<IsoTime> {
  const { lastSeenAt } = presence;
  if (presence.online || Predicate.isUndefined(lastSeenAt)) {
    return now;
  }
  return Effect.succeed(lastSeenAt);
}

function announced({
  after,
  announce,
  before,
  identity,
}: Change & { readonly announce: Announce }): Effect.Effect<void> {
  return Effect.gen(function* announceChange() {
    const wasLive = presenceIn({ identity, state: before });
    const isLive = presenceIn({ identity, state: after });
    if (wasLive.online !== isLive.online || before.ends.get(identity) !== after.ends.get(identity)) {
      const lastSeenAt = yield* lastSeenOf(isLive);
      yield* announce.record({ identity, lastSeenAt, online: isLive.online, ...endIn({ identity, state: after }) });
    }
    const was = reachablePresenceIn({ identity, state: before });
    const is = reachablePresenceIn({ identity, state: after });
    yield* alerting({
      alerts: announce.alerts,
      end: after.ends.get(identity),
      is,
      was,
      wentOffline: wasLive.online && !isLive.online,
    });
    if (!samePresence(was, is)) {
      yield* announce.publish(is);
    }
  });
}

function announcer(
  storage: Storage["Service"],
): Effect.Effect<Announce & { readonly hub: PubSub.PubSub<Presence> }, never, AnnounceNeeds> {
  return Effect.gen(function* openAnnouncer() {
    const hub = yield* PubSub.unbounded<Presence>();
    const alerts = yield* OfflineAlerts;
    const offers = yield* DeactivationOffers;
    return {
      alerts,
      hub,
      publish: (presence) => Effect.asVoid(PubSub.publish(hub, presence)),
      record: (presence) => Effect.andThen(Effect.ignore(storage.recordPresence(presence)), offers.presenceChanged),
    };
  });
}

type AnnounceNeeds = OfflineAlerts | DeactivationOffers;

export { type Announce, type AnnounceNeeds, announced, announcer, now };

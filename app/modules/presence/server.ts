/**
 * Presence on the backend (ADR "presence comes from live connections"): the `PresenceRegistry` service keeps every
 * identity's live connections in memory, as the per-identity limits do (ADR 0033), and `GET /v1/presence` answers
 * every identity's presence. Every `/v1/events` stream is a live connection, whatever its query: the stream holds one
 * for as long as it is open, and the all-channels feed sends each change as a `presence` event. An identity stays
 * online for `COOKOUT_PRESENCE_GRACE_SECONDS` after its last live connection closes, and storage keeps when it was
 * last seen and whether it was online, so after a restart the identities that were online keep showing online for
 * 5 minutes, ample for a retrying `cookout watch` (at most 30 s between tries), or until they reconnect. An identity the `IdentityChanges`
 * hub announces deleted leaves the registry, as it leaves storage. An agent holds one live connection at most
 * (ADR "one live connection per agent"): a newer one ends the one before with `watchReplacedRefusal`.
 */
import type { Config, Option, PubSub, Scope } from "effect";
import type { Connection, Registry, RegistryNeeds } from "./lib/server/registry.ts";
import { Context, Duration, Effect, Layer } from "effect";
import type { Identity, IdentityName } from "../identities/index.ts";
import type { LiveConnectionId, Presence } from "./index.ts";
import { connectionOf, openRegistry, openReplacements, watchReplacedRefusal } from "./lib/server/registry.ts";
import type { PresenceRouteNeeds } from "./lib/server/seen-by-caller.ts";
import type { Refusal } from "../http/index.ts";
import type { Route } from "../http/server.ts";
import { Storage } from "../storage/server.ts";
import type { StorageUnavailable } from "../storage/server.ts";
import type { TriggerResult } from "../triggers/index.ts";
import { presenceGraceSeconds } from "../config/server.ts";
import { presenceRouteOn } from "./lib/server/seen-by-caller.ts";

const BOOT_GRACE = Duration.toMillis("5 minutes");
const ONE_AT_A_TIME = { concurrency: 1 } as const;

function presenceOfEach(registry: Registry, identities: readonly Identity[]): Effect.Effect<readonly Presence[]> {
  return Effect.forEach(
    identities,
    ({ deactivated, name }) => {
      if (deactivated === true) {
        return registry.livePresenceOf(name);
      }
      return registry.presenceOf(name);
    },
    ONE_AT_A_TIME,
  );
}

/** A live connection the stream holds (ADR "how a live connection ends"). */
export interface LiveConnection {
  /** The connection ID the `connected` event carries, which a clean close names. */
  readonly id: LiveConnectionId;
  /**
   * Succeeds with the refusal the stream must end with: `watch_replaced` once a newer live connection of the same
   * agent replaces this one, or the refusal for a token a request just ended (left, revoked, rotated, deactivated).
   */
  readonly ended: Effect.Effect<Refusal>;
  /** Ends this live connection at once, offline with the refusal's reason, for a refusal the stream found itself. */
  readonly refused: (refusal: Refusal) => Effect.Effect<Refusal>;
}

/** The presence of the running server's identities. */
export interface PresenceService {
  /**
   * Holds a live connection of `identity`, with how it connects, until the scope closes. An agent holds one at most,
   * so an agent's replaces the one it held before.
   */
  readonly holdLiveConnection: (
    identity: Identity,
    connection: Connection,
  ) => Effect.Effect<LiveConnection, never, Scope.Scope>;
  /**
   * Marks live connection `id` of `identity` as closing cleanly (its `cookout watch` exits on purpose), so its end is
   * expected. Answers false when `identity` holds no such connection and is in no grace it started.
   */
  readonly closeCleanly: (identity: IdentityName, id: LiveConnectionId) => Effect.Effect<boolean>;
  /** Every identity's presence, Deactivated ones (always offline) included, sorted by name. */
  readonly everyone: Effect.Effect<readonly Presence[], StorageUnavailable>;
  /** Each identity's presence the moment it changes. */
  readonly changed: Effect.Effect<PubSub.Subscription<Presence>, never, Scope.Scope>;
  /** How many live connections `identity` holds now, for tests that wait for a closed stream to be noticed. */
  readonly liveConnections: (identity: IdentityName) => Effect.Effect<number>;
  /**
   * Sets whether agent `identity` has a trigger URL, and how its last call went, or (`Option.none()`) that it has none
   * or is Deactivated. With one whose last call didn't fail it is online; with a failed one and no live connection,
   * Unreachable.
   */
  readonly setReach: (identity: IdentityName, reach: Option.Option<TriggerReach>) => Effect.Effect<void>;
}

/** What presence knows of an agent's trigger URL: how its last call went, if it has been called. */
export interface TriggerReach {
  readonly lastResult?: TriggerResult;
}

export class PresenceRegistry extends Context.Service<PresenceRegistry, PresenceService>()(
  "@ai-hero/cookout/presence/server/PresenceRegistry",
) {}

/** `PresenceRegistry` on the running `Storage`, with the grace from `COOKOUT_PRESENCE_GRACE_SECONDS`. */
export const presenceLayer: Layer.Layer<PresenceRegistry, Config.ConfigError | StorageUnavailable, RegistryNeeds> =
  Layer.effect(
    PresenceRegistry,
    Effect.gen(function* openPresence() {
      const storage = yield* Storage;
      const graceSeconds = yield* presenceGraceSeconds;
      const graceMillis = Duration.toMillis(Duration.seconds(graceSeconds));
      const registry = yield* openRegistry({ bootGraceMillis: BOOT_GRACE, graceMillis });
      const replacements = yield* openReplacements;
      return {
        changed: registry.changed,
        closeCleanly: registry.closeCleanly,
        everyone: Effect.flatMap(storage.listIdentities(), (identities) => presenceOfEach(registry, identities)),
        holdLiveConnection: (identity, connection) =>
          Effect.gen(function* holdLiveConnectionOf() {
            const held = yield* registry.hold(identity.name, connection);
            const place = yield* replacements.take(identity);
            const replaced = Effect.as(place.replaced, watchReplacedRefusal);
            return { ended: Effect.raceFirst(held.ended, replaced), id: held.connection, refused: held.refused };
          }),
        liveConnections: registry.liveConnections,
        setReach: registry.setReach,
      };
    }),
  );

/**
 * Holds a live connection of the stream's caller until the scope closes. A stream sent with no `Authorization`
 * header (so with the web UI's session cookie) is a web tab; any other is a `cookout watch`, with the host its agent
 * session was joined from when it was sent with an agent session token whose joining client sent one. The answer's
 * `ended` succeeds with the refusal the stream must end with.
 */
export const holdLiveConnection = Effect.fnUntraced(function* holdCallersLiveConnection(stream: {
  readonly caller: Identity;
  readonly authorization: string | undefined;
}): Effect.fn.Return<LiveConnection, never, PresenceRegistry | Storage | Scope.Scope> {
  const presence = yield* PresenceRegistry;
  const connection = yield* connectionOf(stream);
  return yield* presence.holdLiveConnection(stream.caller, connection);
});

/** `GET /v1/presence`, for the server's route list, behind the token gate. The caller reads its own agents' warnings. */
export const presenceRoutes: readonly Route<PresenceRegistry | PresenceRouteNeeds>[] = [
  presenceRouteOn(Effect.flatMap(PresenceRegistry, (presence: PresenceService) => presence.everyone)),
];

/** The Schemas of one identity's presence and of `GET /v1/presence`'s answer, for the live stream and the SDK's validators. */
export { PresenceResponseSchema, PresenceSchema } from "./lib/server/wire.ts";

/** The Schema of how a call to a trigger URL went, which an Unreachable presence and a trigger URL both carry. */
export { TriggerResultSchema } from "./lib/server/wire.ts";

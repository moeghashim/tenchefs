import { AgentSessions, agentSessionsOn } from "./service.ts";
import type { Config, Scope } from "effect";
import { DateTime, Effect, Layer, Option, PubSub } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { JoinRequestChange, JoinRequestChanges, StartedJoinRequest } from "./join-requests.ts";
import { IdentityChanges } from "../../../identities/server.ts";
import type { IsoTime } from "../../../time/index.ts";
import { Secrets } from "../../../secrets/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { idleSecondsOf } from "./idle-expiry.ts";
import { maxIdleExpiry } from "../../../config/server.ts";

function until(moment: IsoTime): Effect.Effect<void> {
  return Effect.flatMap(DateTime.now, (now) => Effect.sleep(DateTime.distance(now, DateTime.makeUnsafe(moment))));
}

function joinRequestChangesOn(): Effect.Effect<
  JoinRequestChanges & { readonly hub: PubSub.PubSub<JoinRequestChange> },
  never,
  Scope.Scope
> {
  return Effect.gen(function* openJoinRequestChanges() {
    const scope = yield* Effect.scope;
    const hub = yield* PubSub.unbounded<JoinRequestChange>();
    function publish(agent: IdentityName): Effect.Effect<void> {
      const change: JoinRequestChange = { agent, reaches: "everyone" };
      return Effect.asVoid(PubSub.publish(hub, change));
    }
    function publishAt(moment: IsoTime, change: JoinRequestChange): Effect.Effect<void> {
      const published = Effect.andThen(until(moment), PubSub.publish(hub, change));
      return Effect.asVoid(Effect.forkIn(published, scope));
    }
    function started({ agent, createdAt, expiresAt, shownToPeopleAt }: StartedJoinRequest): Effect.Effect<void> {
      const shownToPeople = publishAt(shownToPeopleAt, { agent, reaches: "people" });
      return Effect.all(
        [
          publish(agent),
          Effect.when(shownToPeople, Effect.succeed(shownToPeopleAt !== createdAt)),
          publishAt(expiresAt, { agent, reaches: "everyone" }),
        ],
        { concurrency: 1, discard: true },
      );
    }
    return { approved: publish, denied: publish, hub, started };
  });
}

const agentSessionsLayer: Layer.Layer<AgentSessions, Config.ConfigError, Storage | Secrets | IdentityChanges> =
  Layer.effect(
    AgentSessions,
    Effect.gen(function* agentSessionsOnStorage() {
      const maxIdle = yield* maxIdleExpiry;
      const storage = yield* Storage;
      const secrets = yield* Secrets;
      const { endTokens, publish: publishIdentity } = yield* IdentityChanges;
      const ceilingSeconds = idleSecondsOf(maxIdle);
      const hub = yield* PubSub.unbounded<Identity>();
      function publishSession(agent: IdentityName): Effect.Effect<void, StorageUnavailable> {
        return Effect.flatMap(storage.findIdentityByName(agent), (found) =>
          Effect.forEach(Option.toArray(Option.fromUndefinedOr(found)), (identity) => PubSub.publish(hub, identity), {
            concurrency: 1,
            discard: true,
          }),
        );
      }
      const { hub: joinRequestHub, ...joinRequestChanges } = yield* joinRequestChangesOn();
      const on = {
        ceilingSeconds,
        endTokens,
        joinRequestChanges,
        maxIdle,
        publishIdentity,
        publishSession,
        secrets,
        storage,
      };
      return {
        ...agentSessionsOn(on),
        joinRequestChanged: PubSub.subscribe(joinRequestHub),
        sessionChanged: PubSub.subscribe(hub),
      };
    }),
  );

export { agentSessionsLayer };

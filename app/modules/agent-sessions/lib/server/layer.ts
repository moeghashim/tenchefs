import { AgentSessions, agentSessionsOn } from "./service.ts";
import type { Config, Scope } from "effect";
import { DateTime, Effect, Layer, Option, PubSub } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import { IdentityChanges } from "../../../identities/server.ts";
import type { IsoTime } from "../../../time/index.ts";
import type { JoinRequestChanges } from "./join-requests.ts";
import { Secrets } from "../../../secrets/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { idleSecondsOf } from "./idle-expiry.ts";
import { maxIdleExpiry } from "../../../config/server.ts";

function untilExpiry(expiresAt: IsoTime): Effect.Effect<void> {
  return Effect.flatMap(DateTime.now, (now) => {
    const expiry = DateTime.makeUnsafe(expiresAt);
    return Effect.sleep(DateTime.distance(now, expiry));
  });
}

function joinRequestChangesOn(): Effect.Effect<
  JoinRequestChanges & { readonly hub: PubSub.PubSub<IdentityName> },
  never,
  Scope.Scope
> {
  return Effect.gen(function* openJoinRequestChanges() {
    const scope = yield* Effect.scope;
    const hub = yield* PubSub.unbounded<IdentityName>();
    function publish(agent: IdentityName): Effect.Effect<void> {
      return Effect.asVoid(PubSub.publish(hub, agent));
    }
    function publishAtExpiry(agent: IdentityName, expiresAt: IsoTime): Effect.Effect<void> {
      const expired = Effect.andThen(untilExpiry(expiresAt), publish(agent));
      return Effect.asVoid(Effect.forkIn(expired, scope));
    }
    return {
      approved: publish,
      denied: publish,
      hub,
      started: (agent, expiresAt) => Effect.andThen(publish(agent), publishAtExpiry(agent, expiresAt)),
    };
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

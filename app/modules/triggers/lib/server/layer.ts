import { Array as Arr, Context, Effect, Layer, Option, Predicate } from "effect";
import type { Identity, IdentityName } from "../../../identities/index.ts";
import type { Services, Watching } from "./mentions.ts";
import { IdentityChanges } from "../../../identities/server.ts";
import { Messages } from "../../../messages/server.ts";
import { OfflineAlerts } from "../../../inbox/server.ts";
import { PresenceRegistry } from "../../../presence/server.ts";
import { SpawnSettings } from "../../../commands/server.ts";
import { Storage } from "../../../storage/server.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { TriggerCaller } from "./caller.ts";
import type { TriggerReach } from "../../../presence/server.ts";
import { watchMentions } from "./mentions.ts";

const IN_TURN = { concurrency: 1, discard: true } as const;

type Kept = Effect.Success<ReturnType<Storage["Service"]["listTriggers"]>>[number];

function reachOf({ lastResult }: Kept): Option.Option<TriggerReach> {
  if (Predicate.isUndefined(lastResult)) {
    return Option.some({});
  }
  return Option.some({ lastResult });
}

function reachFrom(services: Services, agents: readonly IdentityName[]): Effect.Effect<void, StorageUnavailable> {
  return Effect.flatMap(services.storage.listTriggers(agents), (triggers) =>
    Effect.forEach(triggers, (kept) => services.presence.setReach(kept.agent, reachOf(kept)), IN_TURN),
  );
}

function isActiveAgent(identity: Identity): boolean {
  return identity.kind === "agent" && identity.deactivated !== true;
}

function activeAgents(identities: readonly Identity[]): readonly IdentityName[] {
  return Arr.map(Arr.filter(identities, isActiveAgent), ({ name }) => name);
}

class MentionTriggers extends Context.Service<MentionTriggers, true>()(
  "@ai-hero/cookout/triggers/lib/server/layer/MentionTriggers",
) {}

const servicesNow: Effect.Effect<Services, never, OfflineAlerts | TriggerCaller | PresenceRegistry | Storage> =
  Effect.all(
    { alerts: OfflineAlerts, caller: TriggerCaller, presence: PresenceRegistry, storage: Storage },
    { concurrency: 1 },
  );

type WatchingNeeds = Messages | SpawnSettings | OfflineAlerts | TriggerCaller | PresenceRegistry | Storage;

const watchingNow: Effect.Effect<Watching, never, WatchingNeeds> = Effect.gen(function* readWatching() {
  const services = yield* servicesNow;
  const messages = yield* Messages;
  const { publicUrl } = yield* SpawnSettings;
  return { posted: messages.posted, publicUrl, services };
});

const mentionTriggersLayer = Layer.effect(
  MentionTriggers,
  Effect.gen(function* startMentionTriggers() {
    const watching = yield* watchingNow;
    const { services } = watching;
    const changes = yield* IdentityChanges;
    yield* watchMentions(watching);
    yield* changes.onTokensEnded(({ cause, identity }) => {
      if (cause === "deactivated") {
        return services.presence.setReach(identity, Option.none());
      }
      return Effect.void;
    });
    yield* changes.onReactivated((identity) => Effect.ignore(reachFrom(services, activeAgents([identity]))));
    const everyone = yield* services.storage.listIdentities();
    yield* reachFrom(services, activeAgents(everyone));
    return true as const;
  }),
);

export { mentionTriggersLayer };

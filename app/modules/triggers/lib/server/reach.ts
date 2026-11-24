import { Effect, Option } from "effect";
import type { Identity } from "../../../identities/index.ts";
import { OfflineAlerts } from "../../../inbox/server.ts";
import { PresenceRegistry } from "../../../presence/server.ts";

type ReachNeeds = PresenceRegistry | OfflineAlerts;

function reached(agent: Identity): Effect.Effect<void, never, ReachNeeds> {
  return Effect.gen(function* resetReach() {
    const presence = yield* PresenceRegistry;
    const alerts = yield* OfflineAlerts;
    yield* alerts.triggerCleared(agent.name);
    if (agent.deactivated === true) {
      return;
    }
    yield* presence.setReach(agent.name, Option.some({}));
  });
}

function unreached(agent: Identity): Effect.Effect<void, never, ReachNeeds> {
  return Effect.gen(function* dropReach() {
    const presence = yield* PresenceRegistry;
    const alerts = yield* OfflineAlerts;
    yield* presence.setReach(agent.name, Option.none());
    yield* alerts.triggerCleared(agent.name);
  });
}

export { type ReachNeeds, reached, unreached };

import { BoardUrl } from "./board-url.ts";
import { Effect } from "effect";
import { Messages } from "../../../messages/server.ts";
import { OfflineAlerts } from "../../../inbox/server.ts";
import { PresenceRegistry } from "../../../presence/server.ts";
import { Storage } from "../../../storage/server.ts";
import { TriggerCaller } from "./caller.ts";
import { TriggerChanges } from "./changes.ts";

interface Services {
  readonly storage: Storage["Service"];
  readonly presence: PresenceRegistry["Service"];
  readonly alerts: OfflineAlerts["Service"];
  readonly caller: TriggerCaller["Service"];
  readonly changes: TriggerChanges["Service"];
}

interface Watching {
  readonly services: Services;
  readonly boardUrl: Effect.Effect<string>;
  readonly posted: Messages["Service"]["posted"];
}

type ServicesNeeds = OfflineAlerts | TriggerCaller | TriggerChanges | PresenceRegistry | Storage;

const servicesNow: Effect.Effect<Services, never, ServicesNeeds> = Effect.all(
  {
    alerts: OfflineAlerts,
    caller: TriggerCaller,
    changes: TriggerChanges,
    presence: PresenceRegistry,
    storage: Storage,
  },
  { concurrency: 1 },
);

type WatchingNeeds = Messages | BoardUrl | ServicesNeeds;

const watchingNow: Effect.Effect<Watching, never, WatchingNeeds> = Effect.gen(function* readWatching() {
  const services = yield* servicesNow;
  const messages = yield* Messages;
  const boardUrl = yield* BoardUrl;
  return { boardUrl: boardUrl.url, posted: messages.posted, services };
});

export { type Services, type Watching, watchingNow };

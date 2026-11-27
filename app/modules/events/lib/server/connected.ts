import type { Connected, StreamRequest } from "./source.ts";
import { ConnectedEventSchema, PresenceEventSchema } from "./wire.ts";
import { Effect, Schema, Stream } from "effect";
import { PresenceRegistry, holdLiveConnection } from "../../../presence/server.ts";
import { asksAsRunner, asksForAllChannels } from "./all-channels.ts";
import { refusalSseEvent, sseEvent } from "./source.ts";
import type { CredentialWatch } from "./credential-ended.ts";
import { Messages } from "../../../messages/server.ts";
import { OfflineAlerts } from "../../../inbox/server.ts";
import type { Presence } from "../../../presence/index.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { presenceName } from "../../../presence/index.ts";
import { sentCredentialEnded } from "./credential-ended.ts";

const encodeConnected = Schema.encodeEffect(Schema.fromJsonString(ConnectedEventSchema));
const presenceEvent = sseEvent(PresenceEventSchema);

type LiveConnectionNeeds = Messages | PresenceRegistry | CredentialWatch;

function connected(stream: StreamRequest): Connected<LiveConnectionNeeds> {
  const { authorization, caller } = stream;
  return Effect.gen(function* readLatestOnRun() {
    const held = yield* holdLiveConnection({ authorization, caller, runner: asksAsRunner(stream) });
    const messages = yield* Messages;
    const request = yield* Effect.context<CredentialWatch>();
    const sessionEnded = Effect.flatMap(Effect.provideContext(sentCredentialEnded, request), held.refused);
    const ended = Stream.fromEffect(Effect.flatMap(Effect.raceFirst(held.ended, sessionEnded), refusalSseEvent));
    const sayingConnected = Stream.fromEffect(
      Effect.gen(function* sayConnected() {
        const latest = yield* messages.latestId;
        const data = yield* Effect.orDie(
          encodeConnected({ connectionId: held.id, latestMessageId: latest ?? null, type: "connected" }),
        );
        return { data, event: "connected" } as const;
      }),
    );
    return Stream.concat(sayingConnected, ended);
  });
}

function seenBy(
  alerts: OfflineAlerts["Service"],
  { caller }: StreamRequest,
  changed: Presence,
): Effect.Effect<{ readonly presence: Presence; readonly type: typeof presenceName }, StorageUnavailable> {
  if (changed.online) {
    return Effect.succeed({ presence: changed, type: presenceName });
  }
  return Effect.map(alerts.warningsFor(caller.name), (warned) => ({ presence: warned(changed), type: presenceName }));
}

function presence(request: StreamRequest): Connected<PresenceRegistry | OfflineAlerts> {
  return Effect.gen(function* subscribeToPresence() {
    if (!asksForAllChannels(request)) {
      return Stream.empty;
    }
    const registry = yield* PresenceRegistry;
    const alerts = yield* OfflineAlerts;
    const changed = yield* registry.changed;
    return Stream.fromSubscription(changed).pipe(
      Stream.mapEffect((changedPresence) => Effect.flatMap(seenBy(alerts, request, changedPresence), presenceEvent)),
    );
  });
}

export { type LiveConnectionNeeds, connected, presence };

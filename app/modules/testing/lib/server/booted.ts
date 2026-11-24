import { Array as Arr, Context, Effect, Layer, Logger, MutableList, Schedule, Stream } from "effect";
import { AssetStore, Storage } from "../../../storage/server.ts";
import type { AttachmentId } from "../../../attachments/index.ts";
import type { HttpServer } from "effect/http";
import type { Identities } from "../../../identities/server.ts";
import { PresenceRegistry } from "../../../presence/server.ts";
import type { Scope } from "effect";
import type { StoredPresence } from "../../../storage/server.ts";
import { TestClock } from "effect/testing";
import type { WebhookFake } from "../../../webhook-fake/server.ts";
import { identityName } from "./identities.ts";
import { serverUrl } from "../../../http/server.ts";

type BootedContext = Context.Context<Storage | AssetStore | Identities | WebhookFake | PresenceRegistry>;

interface Booted {
  readonly url: string;
  readonly server: BootedContext;
}

const NO_CONNECTIONS = 0;
const NOTICED_EVERY = "2 millis";

function booted<Failure>(
  layer: Layer.Layer<
    Storage | AssetStore | Identities | WebhookFake | PresenceRegistry | HttpServer.HttpServer,
    Failure
  >,
): Effect.Effect<Booted, Failure, Scope.Scope> {
  return Effect.gen(function* buildServer() {
    const server = yield* Layer.build(layer);
    const url = yield* serverUrl.pipe(Effect.provideContext(server));
    return { server, url };
  });
}

interface LoggedLine {
  readonly level: string;
  readonly message: string;
}

interface CapturedLogs {
  readonly layer: Layer.Layer<never>;
  readonly lines: Effect.Effect<readonly LoggedLine[]>;
}

function lineOf({ level, message }: { readonly level: string; readonly message: unknown }): LoggedLine {
  return { level, message: Arr.join(Arr.map(Arr.ensure(message), String), " ") };
}

const capturedLogs: Effect.Effect<CapturedLogs> = Effect.sync(() => {
  const kept = MutableList.make<LoggedLine>();
  const capture = Logger.map(Logger.map(Logger.formatStructured, lineOf), (line) => {
    MutableList.append(kept, line);
  });
  return {
    layer: Logger.layer([capture], { mergeWithExisting: true }),
    lines: Effect.sync(() => MutableList.toArray(kept)),
  };
});

function heldAssetsOn(server: BootedContext): (ids: readonly AttachmentId[]) => Effect.Effect<readonly AttachmentId[]> {
  const assets = Context.get(server, AssetStore);
  return (ids) => Effect.filter(ids, (id) => Effect.isSuccess(Stream.runDrain(assets.read(id))));
}

function liveConnectionsClosedOn({
  name,
  server,
}: {
  readonly server: BootedContext;
  readonly name: string;
}): Effect.Effect<void> {
  const registry = Context.get(server, PresenceRegistry);
  return registry
    .liveConnections(identityName(name))
    .pipe(
      Effect.repeat({ schedule: Schedule.spaced(NOTICED_EVERY), until: (open) => open === NO_CONNECTIONS }),
      TestClock.withLive,
      Effect.asVoid,
    );
}

type LastEnd = Pick<StoredPresence, "endedUnexpectedly" | "offlineReason">;

function endIn(kept: StoredPresence): LastEnd {
  const { identity: _identity, lastSeenAt: _lastSeenAt, online: _online, ...end } = kept;
  return end;
}

function lastEndOn({
  name,
  server,
}: {
  readonly server: BootedContext;
  readonly name: string;
}): Effect.Effect<LastEnd> {
  const storage = Context.get(server, Storage);
  return storage.listPresence([identityName(name)]).pipe(
    Effect.map((kept) => Arr.reduce(kept, {}, (_none: LastEnd, each) => endIn(each))),
    Effect.orDie,
  );
}

export {
  type Booted,
  type LastEnd,
  type LoggedLine,
  booted,
  capturedLogs,
  heldAssetsOn,
  lastEndOn,
  liveConnectionsClosedOn,
};

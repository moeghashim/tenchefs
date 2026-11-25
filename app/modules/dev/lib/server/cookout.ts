import { Clock, Context, Effect, FileSystem, Layer, Path } from "effect";
import { Secrets, secretsLive } from "../../../secrets/server.ts";
import { WebhookFake, webhookFake } from "../../../webhook-fake/server.ts";
import { cuttableRelay, serverUrl } from "../../../http/server.ts";
import { diskAssetStore, sqliteStorage } from "../../../storage/server.ts";
import type { Scope } from "effect";
import { adjustableClock } from "./adjustable-clock.ts";
import { cookoutServer } from "../../../cli/server.ts";
import { triggerCallerLive } from "../../../triggers/server.ts";
import { viteDevServer } from "./web.ts";

interface DevCookout {
  readonly adminToken: string;
  readonly clockUrl: string;
  readonly database: string;
  readonly relayUrl: string;
  readonly url: string;
  readonly webhookFakeUrl: string;
  readonly webUrl: string;
}

type Needs = FileSystem.FileSystem | Path.Path | Scope.Scope;

const LOCAL = "127.0.0.1";

function databaseInTempFolder(): Effect.Effect<string, never, Needs> {
  return Effect.gen(function* makeDatabasePath() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-dev-" }));
    return path.join(folder, "cookout.db");
  });
}

function devCookoutOn(port: number, probe: boolean): Effect.Effect<Omit<DevCookout, "clockUrl">, never, Needs> {
  return Effect.gen(function* startDevCookout() {
    const database = yield* databaseInTempFolder();
    const live = yield* Layer.build(
      Layer.mergeAll(sqliteStorage(database), diskAssetStore(`${database}-assets`), secretsLive, triggerCallerLive),
    );
    const adminToken = yield* Context.get(live, Secrets).newToken;
    const backing = Layer.succeedContext(live);
    const server = yield* Layer.build(cookoutServer({ adminToken, host: LOCAL, port }).pipe(Layer.provide(backing)));
    const fake = yield* Layer.build(webhookFake);
    const url = yield* Effect.provideContext(serverUrl, server);
    const webUrl = yield* viteDevServer({ cookoutUrl: url, probe });
    const relay = yield* cuttableRelay(webUrl);
    return {
      adminToken,
      database,
      relayUrl: relay.url,
      url,
      webUrl,
      webhookFakeUrl: Context.get(fake, WebhookFake).url,
    };
  }).pipe(Effect.orDie);
}

interface DevCookoutOptions {
  readonly port: number;
  readonly probe: boolean;
}

function devCookout({ port, probe }: DevCookoutOptions): Effect.Effect<DevCookout, never, Needs> {
  return Effect.gen(function* startOnAdjustableClock() {
    const { clock, url } = yield* adjustableClock();
    const dev = yield* Effect.provideService(devCookoutOn(port, probe), Clock.Clock, clock);
    return { ...dev, clockUrl: url };
  });
}

export { devCookout };

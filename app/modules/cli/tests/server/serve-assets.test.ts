import { Array as Arr, Effect, FileSystem } from "effect";
import { answer, freshDatabasePath, refusal, startServe } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { CookoutClient } from "../../../sdk/index.ts";
import { NodeServices } from "@effect/platform-node";
import type { Scope } from "effect";
import type { Secrets } from "../../../secrets/server.ts";
import { createCookoutClient } from "../../../sdk/index.ts";
import { secretsLive } from "../../../secrets/server.ts";

const BYTES = 3;

const FILES = [{ bytes: new Uint8Array(BYTES).fill(BYTES), name: "a.bin" }];

interface ServingAdmin {
  readonly admin: CookoutClient;
  readonly stop: Effect.Effect<void>;
}

function servingWithAssetsIn(
  folder: string,
): Effect.Effect<ServingAdmin, never, NodeServices.NodeServices | Secrets | Scope.Scope> {
  return Effect.gen(function* serveWithAssets() {
    const server = yield* startServe({ database: yield* freshDatabasePath, env: { COOKOUT_ASSETS_DIR: folder } });
    const admin = createCookoutClient({ env: {}, token: server.adminToken, url: server.url });
    yield* answer(() => admin.createChannel({ name: "grill" }));
    const serving: ServingAdmin = { admin, stop: server.stop };
    return serving;
  });
}

it.effect("COOKOUT_ASSETS_DIR holds attachments by ID, and a post whose bytes can't be written posts nothing", () =>
  Effect.gen(function* assetsFolder() {
    const fs = yield* FileSystem.FileSystem;
    const folder = `${yield* freshDatabasePath}-elsewhere`;
    const { admin, stop } = yield* servingWithAssetsIn(folder);
    const { message } = yield* answer(() => admin.createMessage({ attachments: FILES, channel: "grill", text: "a" }));
    const kept = yield* Effect.orDie(
      Effect.tap(fs.readDirectory(folder), () => fs.remove(folder, { recursive: true })),
    );
    const failed = yield* refusal(() => admin.createMessage({ attachments: FILES, channel: "grill", text: "b" }));
    const page = yield* answer(() => admin.listMessages("grill"));
    yield* stop;

    expect(kept).toStrictEqual(Arr.map(message.attachments ?? [], ({ id }) => id));
    expect([failed, Arr.map(page.messages, ({ text }) => text)]).toMatchObject([
      { code: "storage_unavailable" },
      ["a"],
    ]);
  }).pipe(Effect.provide([NodeServices.layer, secretsLive])),
);

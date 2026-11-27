import { Array as Arr, Context, Effect, Layer, Ref } from "effect";
import {
  AssetStore,
  StorageUnavailable,
  diskAssetStore,
  memoryStorage,
  sqliteStorage,
} from "../../../storage/server.ts";
import type { FileSystem, Path, Scope } from "effect";
import {
  ScriptedTriggers,
  scriptedTriggers,
  unusedScriptedTriggers,
  webhookFake,
} from "../../../webhook-fake/server.ts";
import {
  deactivatedMidRunStorage,
  editedMidRunStorage,
  freshDatabasePath,
  memoryAssets,
  pausedMidRunStorage,
  unusableStorage,
} from "./storage.ts";
import { Secrets } from "../../../secrets/server.ts";
import type { Storage } from "../../../storage/server.ts";
import type { Token } from "../../../identities/index.ts";
import type { TriggerCaller } from "../../../triggers/server.ts";
import type { WebhookFake } from "../../../webhook-fake/server.ts";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";
import { secretsOf } from "./secrets.ts";
import { triggerCallerLive } from "../../../triggers/server.ts";

type StorageKind = "memory" | "unusable" | "sqlite" | "paused-mid-run" | "deactivated-mid-run" | "edited-mid-run";

interface BackingOptions {
  readonly storage?: StorageKind;
  readonly secrets?: "test" | "live";
  readonly triggers?: "receiver" | "scripted";
  readonly assets?: "failing-removes" | "first-remove-fails";
}

type Stores = Storage | AssetStore;

type StorageFactory = Effect.Effect<Layer.Layer<Stores>, never, FileSystem.FileSystem | Path.Path | Scope.Scope>;

function sharedStore(layer: Layer.Layer<Storage>): StorageFactory {
  return Effect.map(Layer.build(Layer.merge(layer, memoryAssets)), (store) => Layer.succeedContext(store));
}

function sqliteStores(database: string): Layer.Layer<Stores> {
  const assets = diskAssetStore(`${database}-assets`);
  return Layer.merge(sqliteStorage(database), assets).pipe(Layer.provide(nodeServices), Layer.orDie);
}

const sharedLayers: Readonly<Record<Exclude<StorageKind, "sqlite">, Layer.Layer<Storage>>> = {
  "deactivated-mid-run": deactivatedMidRunStorage,
  "edited-mid-run": editedMidRunStorage,
  memory: memoryStorage,
  "paused-mid-run": pausedMidRunStorage,
  unusable: unusableStorage,
};

function storageOf(kind: StorageKind | undefined): StorageFactory {
  if (kind === "sqlite") {
    return Effect.map(freshDatabasePath, sqliteStores);
  }
  return sharedStore(sharedLayers[kind ?? "memory"]);
}

const failingRemoves: Layer.Layer<AssetStore, never, AssetStore> = Layer.effect(
  AssetStore,
  Effect.map(AssetStore, (assets) => ({
    ...assets,
    remove: () => Effect.fail(StorageUnavailable.make({ message: "The test made this asset store fail to remove." })),
  })),
);

const firstRemoveFails: Layer.Layer<AssetStore, never, AssetStore> = Layer.effect(
  AssetStore,
  Effect.gen(function* failFirstRemove() {
    const assets = yield* AssetStore;
    const failed = yield* Ref.make(false);
    return {
      ...assets,
      remove: (ids) =>
        Effect.flatMap(Ref.get(failed), (already) => {
          if (already || Arr.isReadonlyArrayEmpty(ids)) {
            return assets.remove(ids);
          }
          return Effect.andThen(
            Ref.set(failed, true),
            Effect.fail(StorageUnavailable.make({ message: "The test made this asset store fail to remove once." })),
          );
        }),
    };
  }),
);

function withAssets(stores: Layer.Layer<Stores>, assets: BackingOptions["assets"]): Layer.Layer<Stores> {
  if (assets === "failing-removes") {
    return Layer.merge(stores, Layer.provide(failingRemoves, stores));
  }
  if (assets === "first-remove-fails") {
    return Layer.merge(stores, Layer.provide(firstRemoveFails, stores));
  }
  return stores;
}

function storageFor(options: BackingOptions): Effect.Effect<Layer.Layer<Stores>, never, Scope.Scope> {
  return Effect.flatMap(Layer.build(nodeServices), (node) =>
    Effect.map(Effect.provideContext(storageOf(options.storage), node), (stores) => withAssets(stores, options.assets)),
  );
}

type Backing = Secrets | WebhookFake | TriggerCaller | ScriptedTriggers;

function triggersOf(kind: BackingOptions["triggers"]): Layer.Layer<TriggerCaller | ScriptedTriggers> {
  if (kind === "scripted") {
    return scriptedTriggers;
  }
  return Layer.merge(triggerCallerLive, unusedScriptedTriggers);
}

function backingServices(options: BackingOptions): Layer.Layer<Backing> {
  return Layer.mergeAll(secretsOf(options.secrets ?? "test"), webhookFake, triggersOf(options.triggers));
}

function newToken(store: Context.Context<Secrets>): Effect.Effect<Token> {
  return Context.get(store, Secrets).newToken;
}

function scriptedTriggersIn(store: Context.Context<ScriptedTriggers>): ScriptedTriggers["Service"] {
  return Context.get(store, ScriptedTriggers);
}

export { type StorageKind, backingServices, newToken, scriptedTriggersIn, storageFor };

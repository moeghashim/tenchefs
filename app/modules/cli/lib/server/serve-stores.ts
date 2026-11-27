import { Array as Arr, Effect, Path, Record as Rec, Redacted, String as Str } from "effect";
import type { AssetStore, S3Bucket, Storage, StorageSetting, StorageUnavailable } from "../../../storage/server.ts";
import type { Config, FileSystem, Layer } from "effect";
import {
  assetStoreKind,
  assetStoreRule,
  assetsDirectory,
  databaseUrl,
  s3SettingNames,
  s3Settings,
} from "../../../config/server.ts";
import {
  diskAssetStore,
  s3AssetStore,
  shownDatabase,
  storageSetting,
  withoutDatabaseSecret,
} from "../../../storage/server.ts";
import type { CommandFailed } from "./output.ts";
import type { RunnerHost } from "./host.ts";
import { refused } from "./output.ts";

type ServeStorage = (setting: StorageSetting) => Layer.Layer<Storage, StorageUnavailable, FileSystem.FileSystem>;

interface ServedStorage {
  readonly database: string;
  readonly redact: (text: string) => string;
  readonly setting: StorageSetting;
}

type ChosenAssetStore = Layer.Layer<AssetStore, StorageUnavailable, FileSystem.FileSystem | Path.Path>;

const ONE = 1;

const invalidKind = { code: "asset_store_invalid", message: assetStoreRule };

const invalidEndpoint = {
  code: "s3_endpoint_invalid",
  message: `${s3SettingNames.endpoint} must be a URL, such as https://<account>.r2.cloudflarestorage.com.`,
};

function assetsBeside(database: string): Effect.Effect<string, Config.ConfigError, Path.Path> {
  return Effect.gen(function* assetsFolder() {
    const chosen = yield* assetsDirectory;
    const path = yield* Path.Path;
    if (chosen === "") {
      return path.join(path.dirname(database), "assets");
    }
    return chosen;
  });
}

function notSet(names: readonly string[]): string {
  if (names.length === ONE) {
    return "is not set";
  }
  return "are not set";
}

function missingSettings(names: readonly string[]): Effect.Effect<never, CommandFailed> {
  const missing = {
    code: "s3_settings_missing",
    message: `COOKOUT_ASSET_STORE is s3, but ${Arr.join(names, ", ")} ${notSet(names)}. Set each, or leave COOKOUT_ASSET_STORE unset to keep attachments on disk.`,
  };
  return refused(missing);
}

const s3Store: Effect.Effect<ChosenAssetStore, Config.ConfigError | CommandFailed> = Effect.gen(function* s3Bucket() {
  const settings = yield* s3Settings;
  const unset = Arr.filter(Rec.keys(s3SettingNames), (key) => Str.isEmpty(Redacted.value(settings[key])));
  if (Arr.isReadonlyArrayNonEmpty(unset)) {
    return yield* missingSettings(Arr.map(unset, (key) => s3SettingNames[key]));
  }
  const endpoint = Redacted.value(settings.endpoint);
  if (!URL.canParse(endpoint)) {
    return yield* refused(invalidEndpoint);
  }
  const bucket: S3Bucket = {
    accessKey: Redacted.value(settings.accessKeyId),
    bucket: Redacted.value(settings.bucket),
    endpoint,
    region: Redacted.value(settings.region),
    secret: settings.secretAccessKey,
  };
  return s3AssetStore(bucket);
});

function chosenAssetStore(
  database: string,
): Effect.Effect<ChosenAssetStore, Config.ConfigError | CommandFailed, Path.Path> {
  return Effect.gen(function* chooseAssetStore() {
    const kind = yield* assetStoreKind.pipe(Effect.catchTag("ConfigError", () => refused(invalidKind)));
    if (kind === "s3") {
      return yield* s3Store;
    }
    const folder = yield* assetsBeside(database);
    return diskAssetStore(folder);
  });
}

function servedStorage(path: string): Effect.Effect<ServedStorage, Config.ConfigError> {
  return Effect.map(databaseUrl, (url) => {
    const setting = storageSetting({ path, url });
    return { database: shownDatabase(setting), redact: withoutDatabaseSecret(setting), setting };
  });
}

interface ServeLayers {
  readonly runnerHost?: RunnerHost;
  readonly storage: ServeStorage;
  readonly webFolder?: string;
}

export { chosenAssetStore, servedStorage };
export type { ServeLayers, ServedStorage };

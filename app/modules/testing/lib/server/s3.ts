import type { AssetStore, S3Bucket } from "../../../storage/server.ts";
import { Effect, Function as Fn, Layer, Option, Predicate, Redacted, String as Str } from "effect";
import { Secrets, secretsLive } from "../../../secrets/server.ts";
import { StorageUnavailable, diskAssetStore, memoryAssetStore, s3AssetStore } from "../../../storage/server.ts";
import { freshDatabasePath } from "./storage.ts";
import { inject } from "vitest";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";

interface AssetStoreLayer {
  readonly adapter: "memory" | "disk" | "s3";
  readonly layer: Layer.Layer<AssetStore, StorageUnavailable>;
}

const containerEndpoint: Effect.Effect<string, StorageUnavailable> = Effect.suspend(() => {
  const { endpoint, reason } = inject("s3");
  const unavailable = StorageUnavailable.make({ message: reason });
  return Option.liftPredicate(endpoint, Str.isNonEmpty).pipe(
    Effect.fromOption,
    Effect.mapError(Fn.constant(unavailable)),
  );
});

const freshBucketName: Effect.Effect<string, never, Secrets> = Effect.flatMap(Secrets, (secrets) =>
  Effect.map(secrets.newAttachmentId, (id) => `cookout-test-${id}`),
);

const freshS3Bucket: Effect.Effect<S3Bucket, StorageUnavailable, Secrets> = Effect.gen(function* makeBucket() {
  const endpoint = yield* containerEndpoint;
  const bucket = yield* freshBucketName;
  const { accessKey, region, secret } = inject("s3");
  return { accessKey, bucket, endpoint, region, secret: Redacted.make(secret) };
});

function s3ServeSettings(bucket: S3Bucket): Readonly<Record<string, string>> {
  return {
    COOKOUT_ASSET_STORE: "s3",
    COOKOUT_S3_ACCESS_KEY_ID: bucket.accessKey,
    COOKOUT_S3_BUCKET: bucket.bucket,
    COOKOUT_S3_ENDPOINT: bucket.endpoint,
    COOKOUT_S3_REGION: bucket.region,
    COOKOUT_S3_SECRET_ACCESS_KEY: Redacted.value(bucket.secret),
  };
}

const freshDiskAssets: Layer.Layer<AssetStore, StorageUnavailable> = Layer.unwrap(
  Effect.map(freshDatabasePath, (path) => diskAssetStore(`${path}-assets`)),
).pipe(Layer.provide(nodeServices));

const freshS3Assets: Layer.Layer<AssetStore, StorageUnavailable> = Layer.unwrap(
  Effect.map(freshS3Bucket, s3AssetStore),
).pipe(Layer.provide(secretsLive));

function s3Layers(): readonly AssetStoreLayer[] {
  if (Predicate.isUndefined(inject("s3"))) {
    return [];
  }
  return [{ adapter: "s3", layer: freshS3Assets }];
}

const assetStoreLayers: readonly AssetStoreLayer[] = [
  { adapter: "memory", layer: memoryAssetStore },
  { adapter: "disk", layer: freshDiskAssets },
  ...s3Layers(),
];

export { assetStoreLayers, freshS3Bucket, s3ServeSettings };

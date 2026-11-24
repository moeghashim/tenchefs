import { Array as Arr, Effect, FileSystem, Option, Redacted, Stream } from "effect";
import { AssetStore, diskAssetStore, s3AssetStore } from "../../../storage/server.ts";
import { assetStoreLayers, freshDatabasePath, freshS3Bucket } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { AttachmentId } from "../../../attachments/index.ts";
import type { StorageUnavailable } from "../../../storage/server.ts";
import { isAttachmentId } from "../../../attachments/index.ts";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";
import { secretsLive } from "../../../secrets/server.ts";

const NOTES_SIZE = 5;
const BYTE = 9;
const LARGE_SIZE = 300_000;
const PATTERN = 251;
const UNREACHABLE = "http://127.0.0.1:1";

function attachmentId(raw: string): AttachmentId {
  return Option.getOrThrow(Option.liftPredicate(raw, isAttachmentId));
}

const NOTES = attachmentId("notes-id");
const LARGE = attachmentId("large-id");
const MISSING = attachmentId("missing-id");

function readWhole(id: AttachmentId): Effect.Effect<Uint8Array, StorageUnavailable, AssetStore> {
  return Effect.gen(function* readAll() {
    const assets = yield* AssetStore;
    const chunks = yield* Stream.runCollect(assets.read(id));
    return Uint8Array.from(Arr.flatMap(chunks, (chunk) => [...chunk]));
  });
}

it.effect.each(assetStoreLayers)(
  "asset store ($adapter): bytes are put, read back whole and removed by ID",
  ({ layer }) =>
    Effect.gen(function* assetsRoundTrip() {
      const assets = yield* AssetStore;
      const bytes = new Uint8Array(NOTES_SIZE).fill(BYTE);
      yield* assets.put(NOTES, bytes);
      const read = yield* readWhole(NOTES);
      yield* assets.remove([NOTES]);
      const gone = yield* Effect.flip(readWhole(NOTES));

      expect(read).toStrictEqual(bytes);
      expect(gone).toMatchObject({ _tag: "StorageUnavailable" });
    }).pipe(Effect.provide(layer)),
);

it.effect.each(assetStoreLayers)(
  "asset store ($adapter): an attachment of a few hundred kilobytes reads back byte for byte, and an ID never put holds none",
  ({ layer }) =>
    Effect.gen(function* largeAndMissing() {
      const assets = yield* AssetStore;
      const bytes = Uint8Array.from(Arr.makeBy(LARGE_SIZE, (index) => index % PATTERN));
      yield* assets.put(LARGE, bytes);
      const read = yield* readWhole(LARGE);
      const missing = yield* Effect.flip(readWhole(MISSING));
      yield* assets.remove([MISSING]);

      expect(read).toStrictEqual(bytes);
      expect(missing).toMatchObject({
        _tag: "StorageUnavailable",
        message: `The asset store holds no bytes for attachment ${MISSING}.`,
      });
    }).pipe(Effect.provide(layer)),
);

it.effect("asset store (disk): each file is named by its attachment ID alone, never by its posted name", () =>
  Effect.gen(function* namedById() {
    const fs = yield* FileSystem.FileSystem;
    const folder = `${yield* freshDatabasePath}-assets`;
    const assets = yield* Effect.provide(Effect.service(AssetStore), diskAssetStore(folder));
    yield* assets.put(NOTES, new Uint8Array(NOTES_SIZE).fill(BYTE));
    const files = yield* fs.readDirectory(folder);

    expect(files).toStrictEqual([NOTES]);
  }).pipe(Effect.scoped, Effect.provide(nodeServices)),
);

it.effect("asset store (disk): a put that can't be written fails as unavailable and leaves no partial file", () =>
  Effect.gen(function* putFails() {
    const fs = yield* FileSystem.FileSystem;
    const folder = `${yield* freshDatabasePath}-assets`;
    const assets = yield* Effect.provide(Effect.service(AssetStore), diskAssetStore(folder));
    yield* fs.remove(folder, { recursive: true });
    const failed = yield* Effect.flip(assets.put(NOTES, new Uint8Array(NOTES_SIZE).fill(BYTE)));
    const left = yield* fs.exists(folder);

    expect([failed, left]).toMatchObject([{ _tag: "StorageUnavailable" }, false]);
  }).pipe(Effect.scoped, Effect.provide(nodeServices)),
);

it.effect("asset store (s3): a bucket that refuses the credentials fails every operation as unavailable", () =>
  Effect.gen(function* wrongSecret() {
    const bucket = yield* freshS3Bucket;
    const refusing = s3AssetStore({ ...bucket, secret: Redacted.make("not-the-secret") });
    const assets = yield* Effect.provide(Effect.service(AssetStore), refusing);
    const put = yield* Effect.flip(assets.put(NOTES, new Uint8Array(NOTES_SIZE).fill(BYTE)));
    const read = yield* Effect.flip(Effect.provide(readWhole(NOTES), refusing));
    const removed = yield* Effect.flip(assets.remove([NOTES]));

    expect([put, read, removed]).toMatchObject(
      Arr.map(["PUT", "GET", "DELETE"], (method) => ({
        message: `The asset store's S3 bucket answered 403 to ${method} for attachment ${NOTES}.`,
      })),
    );
  }).pipe(Effect.provide(secretsLive)),
);

it.effect("asset store (s3): an endpoint that can't be reached fails as unavailable, without the secret", () =>
  Effect.gen(function* unreachable() {
    const bucket = yield* freshS3Bucket;
    const offline = s3AssetStore({ ...bucket, endpoint: UNREACHABLE });
    const assets = yield* Effect.provide(Effect.service(AssetStore), offline);
    const failed = yield* Effect.flip(assets.put(NOTES, new Uint8Array(NOTES_SIZE).fill(BYTE)));

    expect(failed.message).toMatch(/^The asset store's S3 bucket could not be reached: /u);
    expect(failed.message).not.toContain(Redacted.value(bucket.secret));
  }).pipe(Effect.provide(secretsLive)),
);

import { Context, Effect, FileSystem, Layer, Option, Path, Ref, Stream } from "effect";
import type { AttachmentId } from "../../../attachments/index.ts";
import { StorageUnavailable } from "./errors.ts";

type Fails<Value> = Effect.Effect<Value, StorageUnavailable>;

interface AssetStoreService {
  readonly put: (id: AttachmentId, bytes: Uint8Array) => Fails<void>;
  readonly read: (id: AttachmentId) => Stream.Stream<Uint8Array, StorageUnavailable>;
  readonly remove: (ids: readonly AttachmentId[]) => Fails<void>;
}

class AssetStore extends Context.Service<AssetStore, AssetStoreService>()(
  "@ai-hero/cookout/storage/lib/server/asset-store/AssetStore",
) {}

const OWNER_ONLY_FOLDER = 0o700;
const OWNER_ONLY_FILE = 0o600;
const ONE_AT_A_TIME = { concurrency: 1, discard: true } as const;
const PARTIAL = ".partial";

function missing(id: AttachmentId): StorageUnavailable {
  return StorageUnavailable.make({ message: `The asset store holds no bytes for attachment ${id}.` });
}

function unavailable({ message }: { readonly message: string }): StorageUnavailable {
  return StorageUnavailable.make({ message });
}

const openMemoryAssets: Effect.Effect<AssetStoreService> = Effect.gen(function* openMemoryAssets() {
  const held = yield* Ref.make<ReadonlyMap<AttachmentId, Uint8Array>>(new Map());
  return {
    put: (id, bytes) => Ref.update(held, (current) => new Map([...current, [id, Uint8Array.from(bytes)]])),
    read: (id) =>
      Stream.unwrap(
        Effect.flatMap(Ref.get(held), (current) =>
          Option.match(Option.fromNullishOr(current.get(id)), {
            onNone: () => Effect.fail(missing(id)),
            onSome: (bytes) => Effect.succeed(Stream.make(bytes)),
          }),
        ),
      ),
    remove: (ids) =>
      Ref.update(held, (current) => {
        const kept = new Map(current);
        for (const id of ids) {
          kept.delete(id);
        }
        return kept;
      }),
  };
});

interface DiskFolder {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly directory: string;
}

function diskPut({ directory, fs, path }: DiskFolder): AssetStoreService["put"] {
  return (id, bytes) => {
    const final = path.join(directory, id);
    const partial = path.join(directory, `${id}${PARTIAL}`);
    return fs.writeFile(partial, bytes, { mode: OWNER_ONLY_FILE }).pipe(
      Effect.andThen(fs.rename(partial, final)),
      Effect.tapError(() => Effect.ignore(fs.remove(partial, { force: true }))),
      Effect.mapError(unavailable),
    );
  };
}

function openDiskAssets(
  directory: string,
): Effect.Effect<AssetStoreService, StorageUnavailable, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* openDiskFolder() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(directory, { mode: OWNER_ONLY_FOLDER, recursive: true }).pipe(Effect.mapError(unavailable));
    const folder = { directory, fs, path };
    return {
      put: diskPut(folder),
      read: (id) => fs.stream(path.join(directory, id)).pipe(Stream.mapError(() => missing(id))),
      remove: (ids) =>
        Effect.forEach(ids, (id) => fs.remove(path.join(directory, id), { force: true }), ONE_AT_A_TIME).pipe(
          Effect.mapError(unavailable),
        ),
    };
  });
}

const memoryAssetStore: Layer.Layer<AssetStore> = Layer.effect(AssetStore, openMemoryAssets);

function diskAssetStore(
  directory: string,
): Layer.Layer<AssetStore, StorageUnavailable, FileSystem.FileSystem | Path.Path> {
  return Layer.effect(AssetStore, openDiskAssets(directory));
}

export { AssetStore, diskAssetStore, memoryAssetStore, missing };

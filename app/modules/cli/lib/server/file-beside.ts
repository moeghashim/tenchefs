import { Deferred, Effect, Function, Option, Stream } from "effect";
import type { FileSystem } from "effect";
import type { StateFolderFailure } from "./state-folder.ts";
import { failure } from "./state-folder.ts";

interface PlainFileBeside {
  readonly exists: Effect.Effect<boolean, StateFolderFailure>;
  readonly readText: Effect.Effect<Option.Option<string>, StateFolderFailure>;
  readonly remove: Effect.Effect<void, StateFolderFailure>;
  readonly untilGone: Effect.Effect<void>;
}

interface BesideLocation {
  readonly file: string;
  readonly folder: string;
  readonly fs: FileSystem.FileSystem;
}

function readTextAt({ file, fs }: BesideLocation): Effect.Effect<Option.Option<string>, StateFolderFailure> {
  return Effect.gen(function* readFileBeside() {
    const exists = yield* fs.exists(file);
    if (!exists) {
      return Option.none();
    }
    const text = yield* fs.readFileString(file);
    return Option.some(text);
  }).pipe(Effect.mapError(failure));
}

interface WatchedFolder {
  readonly folder: string;
  readonly fs: FileSystem.FileSystem;
}

function folderChanges({ folder, fs }: WatchedFolder): Stream.Stream<unknown> {
  return Stream.unwrap(
    Effect.gen(function* watchFolder() {
      const ready = yield* Deferred.make<boolean>();
      function onReady(): void {
        Deferred.doneUnsafe(ready, Effect.succeed(true));
      }
      return Stream.merge(fs.watch(folder, { onReady }), Stream.fromEffect(Deferred.await(ready)));
    }),
  ).pipe(Stream.orDie);
}

function untilGoneAt({ file, folder, fs }: BesideLocation): Effect.Effect<void> {
  const gone = Effect.map(fs.exists(file), (exists) => !exists);
  return folderChanges({ folder, fs }).pipe(
    Stream.mapEffect(() => gone),
    Stream.takeUntil(Function.identity),
    Stream.runDrain,
    Effect.orDie,
  );
}

function fileBeside(location: BesideLocation): PlainFileBeside {
  return {
    exists: Effect.mapError(location.fs.exists(location.file), failure),
    readText: readTextAt(location),
    remove: Effect.mapError(location.fs.remove(location.file, { force: true }), failure),
    untilGone: untilGoneAt(location),
  };
}

export { fileBeside, folderChanges };

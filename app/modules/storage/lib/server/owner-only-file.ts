import { Effect, FileSystem } from "effect";
import { StorageUnavailable } from "./errors.ts";

const OWNER_ONLY = 0o600;

function unavailable({ message }: { readonly message: string }): StorageUnavailable {
  return StorageUnavailable.make({ message });
}

function createOwnerOnly(path: string): Effect.Effect<void, StorageUnavailable, FileSystem.FileSystem> {
  return Effect.gen(function* createDatabaseFile() {
    const fs = yield* FileSystem.FileSystem;
    yield* Effect.scoped(fs.open(path, { flag: "a", mode: OWNER_ONLY }));
  }).pipe(Effect.mapError(unavailable));
}

export { createOwnerOnly };

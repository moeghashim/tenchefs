import { Effect, Ref } from "effect";
import type { MemoryLineage } from "./credential-lineage-memory.ts";
import type { Scope } from "effect";
import { StorageUnavailable } from "./errors.ts";
import { newMemoryLineage } from "./credential-lineage-memory.ts";

export type MemoryState = {
  readonly ensureOpen: Effect.Effect<void, StorageUnavailable>;
  readonly lineage: MemoryLineage;
};

export const openMemoryState: Effect.Effect<MemoryState, never, Scope.Scope> = Effect.gen(function* () {
  const closed = yield* Effect.acquireRelease(Ref.make(false), (ref) => Ref.set(ref, true));
  const ensureOpen = Ref.get(closed).pipe(
    Effect.flatMap((isClosed) =>
      isClosed ? Effect.fail(new StorageUnavailable({ message: "The in-memory store is closed." })) : Effect.void,
    ),
  );
  return { ensureOpen, lineage: newMemoryLineage() };
});

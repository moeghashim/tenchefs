import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { Deferred, Effect, Path, Queue, Stream } from "effect";
import type { Scope } from "effect";

interface FakeInbox {
  readonly nextLine: Effect.Effect<string>;
  readonly waiting: Effect.Effect<readonly string[]>;
}

type Spawns = ChildProcessSpawner.ChildProcessSpawner | Path.Path | Scope.Scope;

const SCRIPT = new URL("../../../../../scripts/fake-claude-inbox.ts", import.meta.url);
const LISTENING = "listening";

function spawned(socket: string): Effect.Effect<ChildProcessSpawner.ChildProcessHandle, never, Spawns> {
  return Effect.gen(function* spawnInbox() {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const script = yield* path.fromFileUrl(SCRIPT);
    return yield* spawner.spawn(ChildProcess.make(process.execPath, [script, socket], { stdin: "ignore" }));
  }).pipe(Effect.orDie);
}

function fakeInbox(socket: string): Effect.Effect<FakeInbox, never, Spawns> {
  return Effect.gen(function* listenOnInbox() {
    const handle = yield* spawned(socket);
    const listening = yield* Deferred.make<boolean>();
    const received = yield* Queue.unbounded<string>();
    const lines = handle.stdout.pipe(Stream.decodeText(), Stream.splitLines);
    function sorted(line: string): Effect.Effect<boolean> {
      if (line === LISTENING) {
        return Deferred.succeed(listening, true);
      }
      return Queue.offer(received, line);
    }
    yield* Effect.forkScoped(Stream.runForEach(lines, sorted));
    yield* Deferred.await(listening);
    return { nextLine: Queue.take(received), waiting: Queue.clear(received) };
  }).pipe(Effect.orDie);
}

export { type FakeInbox, fakeInbox };

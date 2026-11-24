import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { Deferred, Effect, Path, Stream } from "effect";
import type { Duration, Scope } from "effect";
import { TestClock } from "effect/testing";

interface SignalledWatch<Needs> {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly beforeTheSignal: Effect.Effect<void, never, Needs>;
}

interface StoppedWatch {
  readonly exitCode: number;
  readonly stoppedIn: Duration.Duration;
}

type Spawns = ChildProcessSpawner.ChildProcessSpawner | Path.Path | Scope.Scope;

const MAIN = new URL("../../../../main.ts", import.meta.url);
const GIVE_UP_ON_THE_WATCH = "30 seconds";

function firstLineOf<Failure>(stream: Stream.Stream<Uint8Array, Failure>): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* readUntilTheFirstLine() {
    const said = yield* Deferred.make<boolean>();
    const lines = stream.pipe(Stream.decodeText(), Stream.splitLines);
    yield* Effect.forkScoped(Stream.runDrain(Stream.tap(lines, () => Deferred.succeed(said, true))));
    yield* Deferred.await(said);
  });
}

function signalWatchBinary<Needs>({
  args,
  beforeTheSignal,
  env,
}: SignalledWatch<Needs>): Effect.Effect<StoppedWatch, never, Spawns | Needs> {
  return Effect.gen(function* spawnThenSignal() {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const main = yield* path.fromFileUrl(MAIN);
    const handle = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [main, ...args], { env: { ...env }, extendEnv: false }),
    );
    yield* firstLineOf(handle.stderr);
    yield* beforeTheSignal;
    const killed = Effect.andThen(handle.kill({ forceKillAfter: GIVE_UP_ON_THE_WATCH }), handle.exitCode);
    const [stoppedIn, exitCode] = yield* TestClock.withLive(Effect.timed(killed));
    return { exitCode, stoppedIn };
  }).pipe(Effect.orDie);
}

export { signalWatchBinary, type StoppedWatch };

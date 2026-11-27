import { ChildProcess, ChildProcessSpawner } from "effect/process";
import type { CliResult, WatchRun, Watched } from "./command-line.ts";
import { Deferred, Effect, Fiber, Path, Stream } from "effect";
import { cliResult, watched } from "./command-line.ts";
import type { Scope } from "effect";

interface BinaryRun {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

type Spawns = ChildProcessSpawner.ChildProcessSpawner | Path.Path | Scope.Scope;

const MAIN = new URL("../../../../main.ts", import.meta.url);

function collect<Failure>(stream: Stream.Stream<Uint8Array, Failure>): Effect.Effect<string, Failure> {
  return stream.pipe(Stream.decodeText(), Stream.mkString);
}

function runCookoutBinary({ args, env }: BinaryRun): Effect.Effect<CliResult, never, Spawns> {
  return Effect.gen(function* spawnCookout() {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const main = yield* path.fromFileUrl(MAIN);
    const handle = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [main, ...args], { env: { ...env }, extendEnv: false }),
    );
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
      { concurrency: "unbounded" },
    );
    return cliResult({ exitCode, stderr, stdout });
  }).pipe(Effect.orDie);
}

function linesOf<Failure>(stream: Stream.Stream<Uint8Array, Failure>): Stream.Stream<string, Failure> {
  return stream.pipe(Stream.decodeText(), Stream.splitLines);
}

interface AllLines<Failure> {
  readonly started: Effect.Effect<void>;
  readonly lines: Effect.Effect<readonly string[], Failure>;
}

function allLines<Failure>(
  stream: Stream.Stream<Uint8Array, Failure>,
): Effect.Effect<AllLines<Failure>, never, Scope.Scope> {
  return Effect.gen(function* readAllLines() {
    const started = yield* Deferred.make<boolean>();
    const signalled = Stream.tap(linesOf(stream), () => Deferred.succeed(started, true));
    const reading = yield* Effect.forkScoped(Stream.runCollect(signalled));
    return { lines: Fiber.join(reading), started: Effect.asVoid(Deferred.await(started)) };
  });
}

function watchCookoutBinary<During, Needs>({
  args,
  env,
  lines,
  whileWatching,
}: WatchRun<During, Needs>): Effect.Effect<Watched<During>, never, Spawns | Needs> {
  return Effect.gen(function* spawnWatch() {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const main = yield* path.fromFileUrl(MAIN);
    const handle = yield* spawner.spawn(
      ChildProcess.make(process.execPath, [main, ...args], { env: { ...env }, extendEnv: false }),
    );
    const stderr = yield* allLines(handle.stderr);
    yield* stderr.started;
    const during = yield* whileWatching;
    const stdoutLines = yield* Stream.runCollect(Stream.take(linesOf(handle.stdout), lines));
    const errors = yield* Effect.andThen(handle.kill(), stderr.lines);
    return watched({ during, errors, lines: stdoutLines });
  }).pipe(Effect.orDie);
}

export { runCookoutBinary, watchCookoutBinary };

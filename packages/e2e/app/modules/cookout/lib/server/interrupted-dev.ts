import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { Effect, Option, Path, Schema, Stream, pipe } from "effect";
import type { Scope } from "effect";
import { jsonOf } from "./bin.ts";

interface InterruptedDev {
  readonly database: string;
  readonly exitCode: number;
}

type DevNeeds = ChildProcessSpawner.ChildProcessSpawner | Path.Path | Scope.Scope;

const DEV = new URL("../../../../../../../app/dev.ts", import.meta.url);
const isDevRunning = Schema.is(Schema.Struct({ database: Schema.String }));

function databaseIn(line: string): Option.Option<string> {
  return pipe(
    Option.liftPredicate(jsonOf(line), isDevRunning),
    Option.map(({ database }) => database),
  );
}

const interruptedDev: Effect.Effect<InterruptedDev, never, DevNeeds> = Effect.gen(function* interruptDev() {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const dev = yield* path.fromFileUrl(DEV);
  const handle = yield* spawner.spawn(ChildProcess.make(process.execPath, [dev, "start"], { extendEnv: true }));
  const lines = pipe(handle.stdout, Stream.decodeText(), Stream.splitLines, Stream.map(databaseIn));
  const found = yield* Stream.runHead(Stream.filter(lines, Option.isSome));
  yield* handle.kill({ killSignal: "SIGINT" });
  const exitCode = yield* handle.exitCode;
  return { database: Option.getOrElse(Option.flatten(found), () => ""), exitCode };
}).pipe(Effect.orDie);

export { type InterruptedDev, interruptedDev };

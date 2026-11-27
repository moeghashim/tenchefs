import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { Effect, FileSystem, Path, Schema, Stream } from "effect";
import { parseLine } from "./cli.ts";

const MAIN = new URL("../../../../main.ts", import.meta.url);
const ALL_AT_ONCE = { concurrency: "unbounded" } as const;
const encodeLine = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const Environment = Schema.Record(Schema.String, Schema.String);

const CookoutRunSchema = Schema.Struct({ args: Schema.Array(Schema.String), env: Environment });

type CookoutRun = typeof CookoutRunSchema.Type;

type Needs = ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path;

interface RunPlace {
  readonly log: string;
  readonly session: string;
}

interface Collected {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

function collected(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
): Effect.Effect<Collected, never, Needs> {
  return Effect.gen(function* spawnAndCollect() {
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const main = yield* path.fromFileUrl(MAIN);
    const run = ChildProcess.make(process.execPath, [main, ...args], { env, extendEnv: true });
    const handle = yield* spawner.spawn(run);
    return yield* Effect.all(
      {
        exitCode: handle.exitCode,
        stderr: Stream.mkString(Stream.decodeText(handle.stderr)),
        stdout: Stream.mkString(Stream.decodeText(handle.stdout)),
      },
      ALL_AT_ONCE,
    );
  }).pipe(Effect.scoped, Effect.orDie);
}

function recorded({ log, session }: RunPlace) {
  return ({ args, env }: CookoutRun): Effect.Effect<void, never, Needs> =>
    Effect.gen(function* runAndRecordCookout() {
      const fs = yield* FileSystem.FileSystem;
      const harness = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: session, ...env };
      const { exitCode, stderr, stdout } = yield* collected(args, harness);
      const line = { args, event: "cookout", exitCode, stderr: parseLine(stderr), stdout: parseLine(stdout) };
      yield* fs.writeFileString(log, `${yield* encodeLine(line)}\n`, { flag: "a" });
    }).pipe(Effect.orDie);
}

export { CookoutRunSchema, recorded };

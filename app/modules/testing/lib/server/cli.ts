import {
  Array as Arr,
  ConfigProvider,
  Console,
  Deferred,
  Effect,
  Fiber,
  Function,
  Layer,
  Option,
  Schema,
  pipe,
} from "effect";
import { exitCodeAfterFailure, runCookout as runCommandLine } from "../../../cli/server.ts";
import { memoryStorage, storageLayer } from "../../../storage/server.ts";
import type { NodeServices } from "@effect/platform-node/NodeServices";
import type { Scope } from "effect";
import type { Secrets } from "../../../secrets/server.ts";
import type { ServeLayers } from "../../../cli/server.ts";
import { TestConsole } from "effect/testing";
import { devCommandLine } from "../../../dev/server.ts";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";
import { secretsTest } from "./secrets.ts";

interface CliResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stderrJson: unknown;
  readonly stdout: string;
  readonly stdoutJson: unknown;
}

interface ServeProcess {
  readonly adminToken: string;
  readonly lines: readonly unknown[];
  readonly stdout: string;
  readonly stop: Effect.Effect<void>;
  readonly url: string;
}

interface ServeOptions {
  readonly adminToken?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly database?: string;
  readonly port?: number;
  readonly storage?: ServeLayers["storage"];
  readonly webFolder?: string;
}

interface Invocation {
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

type Needs = NodeServices | Secrets;

interface WatchRun<During, WatchNeeds> extends Invocation {
  readonly lines: number;
  readonly whileWatching: Effect.Effect<During, never, WatchNeeds>;
}

interface Watched<During> {
  readonly during: During;
  readonly stderrLines: readonly string[];
  readonly stdoutJson: readonly unknown[];
  readonly stdoutLines: readonly string[];
}

interface CommandLine {
  readonly console: Console.Console;
  readonly env: Readonly<Record<string, string>>;
  readonly program: Effect.Effect<number, never, Needs>;
}

interface Started<Line> {
  readonly line: Line;
  readonly lines: readonly unknown[];
  readonly stdout: string;
  readonly stop: Effect.Effect<void>;
}

const serveAdminToken = "test-admin-token-0123456789abcdef0123456789";
const EXIT_SUCCESS = 0;
const NO_ARGS: readonly string[] = [];
const ANY_FREE_PORT = 0;
const verbLayers: ServeLayers = { storage: Function.constant(memoryStorage) };
const isListening = Schema.is(Schema.Struct({ listening: Schema.String }));
const parseJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

const commandLineServices: Layer.Layer<Needs> = Layer.merge(nodeServices, secretsTest);

function parseLine(line: unknown): unknown {
  return Option.getOrElse(parseJson(String(line)), () => line);
}

function textOf(lines: readonly unknown[]): string {
  return Arr.join(Arr.map(lines, String), "\n");
}

function cliResult({ exitCode, stderr, stdout }: Pick<CliResult, "exitCode" | "stderr" | "stdout">): CliResult {
  return { exitCode, stderr, stderrJson: parseLine(stderr), stdout, stdoutJson: parseLine(stdout) };
}

function exitCodeAfter<Failure>(command: Effect.Effect<void, Failure, Needs>): Effect.Effect<number, never, Needs> {
  return Effect.matchCause(command, {
    onFailure: (cause) => exitCodeAfterFailure({ args: NO_ARGS, cause }),
    onSuccess: Function.constant(EXIT_SUCCESS),
  });
}

function exitCodeOf({ console, env, program }: CommandLine): Effect.Effect<number, never, Needs> {
  return program.pipe(
    Effect.provideService(Console.Console, console),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env })),
  );
}

function captured({ env, program }: Omit<CommandLine, "console">): Effect.Effect<CliResult, never, Needs> {
  return Effect.gen(function* runCaptured() {
    const console = yield* TestConsole.make;
    const exitCode = yield* exitCodeOf({ console, env, program });
    const stdout = yield* console.logLines;
    const stderr = yield* console.errorLines;
    return cliResult({ exitCode, stderr: textOf(stderr), stdout: textOf(stdout) });
  });
}

function runCookout({ args, env }: Invocation): Effect.Effect<CliResult, never, Needs> {
  return captured({ env, program: exitCodeAfter(runCommandLine(args, verbLayers)) });
}

function runDev({ args, env }: Invocation): Effect.Effect<CliResult, never, Needs> {
  return captured({ env, program: exitCodeAfter(devCommandLine(args)) });
}

function startUntil<Line>(
  program: Effect.Effect<number, never, Needs>,
  isReady: (line: unknown) => line is Line,
  env: Readonly<Record<string, string>> = {},
): Effect.Effect<Started<Line>, never, Needs | Scope.Scope> {
  return Effect.gen(function* startInProcess() {
    const output = yield* TestConsole.make;
    const ready = yield* Deferred.make<Line>();
    const console: Console.Console = {
      ...output,
      log: (...line: readonly unknown[]): void => {
        output.log(...line);
        const found = pipe(line, Arr.map(parseLine), Arr.findFirst(isReady));
        if (Option.isSome(found)) {
          Deferred.doneUnsafe(ready, Effect.succeed(found.value));
        }
      },
    };
    const server = yield* Effect.forkScoped(exitCodeOf({ console, env, program }));
    const stopped = Effect.andThen(
      Fiber.join(server),
      Effect.die(new Error("The command stopped before it was ready.")),
    );
    const line = yield* Effect.raceFirst(Deferred.await(ready), stopped);
    const lines = yield* output.logLines;
    return {
      line,
      lines: Arr.map(lines, parseLine),
      stdout: textOf(lines),
      stop: Fiber.interrupt(server),
    } satisfies Started<Line>;
  });
}

function serveCommandLine(options: ServeOptions): Omit<CommandLine, "console"> & Pick<ServeProcess, "adminToken"> {
  const { adminToken = serveAdminToken, database, env = {}, port = ANY_FREE_PORT, ...web } = options;
  const listen = ["serve", "--port", String(port), "--host", "127.0.0.1"];
  const db = Option.match(Option.fromNullishOr(database), { onNone: () => [], onSome: (path) => ["--db", path] });
  const args = [...listen, ...db];
  const program = exitCodeAfter(runCommandLine(args, { storage: storageLayer, ...web }));
  return { adminToken, env: { COOKOUT_ADMIN_TOKEN: adminToken, ...env }, program };
}

function runServe(options: ServeOptions): Effect.Effect<CliResult, never, Needs> {
  return captured(serveCommandLine(options));
}

function startServe(options: ServeOptions): Effect.Effect<ServeProcess, never, Needs | Scope.Scope> {
  const { adminToken, env, program } = serveCommandLine(options);
  const started = startUntil(program, isListening, env);
  return Effect.map(started, ({ line, ...output }) => ({ ...output, adminToken, url: line.listening }));
}

interface SignallingConsole {
  readonly console: Console.Console;
  readonly errors: Effect.Effect<readonly string[]>;
  readonly printed: Effect.Effect<readonly unknown[]>;
  readonly watching: Effect.Effect<string>;
}

function watched<During>({
  during,
  errors,
  lines,
}: {
  readonly during: During;
  readonly errors: readonly unknown[];
  readonly lines: readonly unknown[];
}): Watched<During> {
  const stdoutLines = Arr.map(lines, String);
  const stderrLines = Arr.map(errors, String);
  return { during, stderrLines, stdoutJson: Arr.map(stdoutLines, (line) => parseLine(line)), stdoutLines };
}

function signallingConsole(lines: number): Effect.Effect<SignallingConsole> {
  return Effect.gen(function* makeSignallingConsole() {
    const output = yield* TestConsole.make;
    const watching = yield* Deferred.make<string>();
    const printed = yield* Deferred.make<readonly unknown[]>();
    const logged: unknown[] = [];
    const errored: string[] = [];
    const console: Console.Console = {
      ...output,
      error: (...line: readonly unknown[]): void => {
        output.error(...line);
        errored.push(textOf(line));
        Deferred.doneUnsafe(watching, Effect.succeed(textOf(line)));
      },
      log: (...line: readonly unknown[]): void => {
        output.log(...line);
        logged.push(textOf(line));
        if (logged.length >= lines) {
          Deferred.doneUnsafe(printed, Effect.succeed(logged));
        }
      },
    };
    return {
      console,
      errors: Effect.sync(() => [...errored]),
      printed: Deferred.await(printed),
      watching: Deferred.await(watching),
    };
  });
}

function watchCookout<During, WatchNeeds>({
  args,
  env,
  lines,
  whileWatching,
}: WatchRun<During, WatchNeeds>): Effect.Effect<Watched<During>, never, Needs | WatchNeeds | Scope.Scope> {
  return Effect.gen(function* watchInProcess() {
    const { console, errors, printed, watching } = yield* signallingConsole(lines);
    const program = exitCodeAfter(runCommandLine(args, verbLayers));
    const command = yield* Effect.forkScoped(exitCodeOf({ console, env, program }));
    yield* watching;
    const during = yield* whileWatching;
    const stdout = yield* printed;
    yield* Fiber.interrupt(command);
    return watched({ during, errors: yield* errors, lines: stdout });
  });
}

interface DevCommand<Line> {
  readonly args: readonly string[];
  readonly isReady: (line: unknown) => line is Line;
}

function startDevCommand<Line>({
  args,
  isReady,
}: DevCommand<Line>): Effect.Effect<Started<Line>, never, Needs | Scope.Scope> {
  return startUntil(exitCodeAfter(devCommandLine(args)), isReady);
}

export {
  type CliResult,
  type Needs as CommandLineNeeds,
  type ServeProcess,
  type ServeOptions,
  type WatchRun,
  type Watched,
  cliResult,
  commandLineServices,
  exitCodeAfter,
  exitCodeOf,
  parseLine,
  verbLayers,
  runCookout,
  runDev,
  startDevCommand,
  runServe,
  startServe,
  watchCookout,
  watched,
};

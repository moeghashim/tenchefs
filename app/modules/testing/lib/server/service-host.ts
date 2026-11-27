import { Array as Arr, Effect, FileSystem, Option, Path, String as Str } from "effect";
import type { Scope } from "effect";
import type { ServeLayers } from "../../../cli/server.ts";

interface Failing {
  readonly command: string;
  readonly stderr: string;
}

interface ServiceHostOptions {
  readonly failing?: Failing;
  readonly linger?: boolean;
  readonly osRelease?: string;
  readonly platform: string;
  readonly wslConf?: string;
}

type RunnerHost = NonNullable<ServeLayers["runnerHost"]>;

interface ServiceHost {
  readonly calls: Effect.Effect<readonly string[]>;
  readonly env: { readonly COOKOUT_STATE_DIR: string; readonly HOME: string; readonly PATH: string };
  readonly home: string;
  readonly host: RunnerHost;
  readonly stateFolder: string;
}

interface Folders {
  readonly bin: string;
  readonly log: string;
  readonly root: string;
}

type Needs = FileSystem.FileSystem | Path.Path | Scope.Scope;

const EXECUTABLE = 0o755;
const PRIVATE_FOLDER = 0o700;
const TEST_UID = 501;
const SERVICE_COMMANDS = ["launchctl", "loginctl", "systemctl"] as const;
const COOKOUT_ARGV = ["/opt/node/bin/node", "/opt/cookout/bin/cookout"];

function lingerAnswer(command: string, options: ServiceHostOptions): string {
  if (command !== "loginctl") {
    return "";
  }
  let linger = "no";
  if (options.linger === true) {
    linger = "yes";
  }
  return `if [ "$1" = show-user ]; then echo 'Linger=${linger}'; fi\n`;
}

function fakeScript(
  command: string,
  { log, options }: { readonly log: string; readonly options: ServiceHostOptions },
): string {
  const record = `#!/bin/sh\necho "${command} $*" >> '${log}'\n`;
  const answered = `${record}${lingerAnswer(command, options)}`;
  return Option.match(
    Option.filter(Option.fromNullishOr(options.failing), (fails) => Str.startsWith(command)(fails.command)),
    {
      onNone: () => answered,
      onSome: (fails) =>
        `${answered}case "${command} $*" in '${fails.command}'*) echo '${fails.stderr}' >&2; exit 1;; esac\n`,
    },
  );
}

function writeIfGiven(file: string, text: string | undefined): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Option.match(Option.fromNullishOr(text), {
      onNone: () => Effect.void,
      onSome: (value) => Effect.orDie(fs.writeFileString(file, value)),
    }),
  );
}

const folders: Effect.Effect<Folders, never, Needs> = Effect.gen(function* makeFolders() {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "cookout-service-" }));
  const bin = path.join(root, "bin");
  const log = path.join(root, "calls.log");
  yield* Effect.orDie(fs.makeDirectory(bin, { recursive: true }));
  yield* Effect.orDie(fs.writeFileString(log, ""));
  return { bin, log, root };
});

function fakeCommands(made: Folders, options: ServiceHostOptions): Effect.Effect<void, never, Needs> {
  return Effect.gen(function* writeFakeCommands() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* Effect.forEach(
      SERVICE_COMMANDS,
      (command) =>
        Effect.orDie(
          fs.writeFileString(path.join(made.bin, command), fakeScript(command, { log: made.log, options }), {
            mode: EXECUTABLE,
          }),
        ),
      { concurrency: 1, discard: true },
    );
  });
}

function callsIn(log: string): Effect.Effect<readonly string[], never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.map(Effect.orDie(fs.readFileString(log)), (text) => Arr.filter(Str.split("\n")(text), Str.isNonEmpty)),
  );
}

function hostOn(made: Folders, options: ServiceHostOptions): Effect.Effect<RunnerHost, never, Needs> {
  return Effect.gen(function* makeHost() {
    const path = yield* Path.Path;
    const host = {
      cookout: COOKOUT_ARGV,
      osRelease: path.join(made.root, "osrelease"),
      platform: options.platform,
      uid: TEST_UID,
      wslConf: path.join(made.root, "wsl.conf"),
    };
    yield* writeIfGiven(host.osRelease, options.osRelease);
    yield* writeIfGiven(host.wslConf, options.wslConf);
    return host;
  });
}

function serviceHost(options: ServiceHostOptions): Effect.Effect<ServiceHost, never, Needs> {
  return Effect.gen(function* makeServiceHost() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const made = yield* folders;
    const home = path.join(made.root, "home");
    const stateFolder = path.join(home, "state");
    yield* Effect.orDie(fs.makeDirectory(stateFolder, { mode: PRIVATE_FOLDER, recursive: true }));
    yield* fakeCommands(made, options);
    const host = yield* hostOn(made, options);
    const calls = Effect.provideService(callsIn(made.log), FileSystem.FileSystem, fs);
    return {
      calls,
      env: { COOKOUT_STATE_DIR: stateFolder, HOME: home, PATH: `${made.bin}:/usr/bin:/bin` },
      home,
      host,
      stateFolder,
    };
  });
}

export { type ServiceHost, type ServiceHostOptions, serviceHost };

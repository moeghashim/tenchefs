import { Array as Arr, Effect, FileSystem, Function, Option, Path, String as Str, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { LABEL, UNIT, plistText, unitText } from "./service-files.ts";
import { checkFolder, stateFolderPath } from "./state-folder.ts";
import { home, pathVariable, xdgConfigHome } from "../../../config/server.ts";
import { hostKind, wslSystemdOn } from "./runner-host.ts";
import type { CallFailure } from "./adapters/sdk.ts";
import { RunnerHost as Host } from "./host.ts";
import type { HostKind } from "./runner-host.ts";
import type { RunnerHost } from "./host.ts";
import type { ServiceSettings } from "./service-files.ts";

type Argv = readonly [string, ...string[]];

interface Done {
  readonly argv: Argv;
  readonly prints: string;
}

interface Step {
  readonly argv: Argv;
  readonly mayFail: boolean;
  readonly skipWhen?: Done;
}

interface Service {
  readonly afterRemove: readonly Step[];
  readonly file: string;
  readonly install: readonly Step[];
  readonly kind: HostKind;
  readonly settings: ServiceSettings;
  readonly stop: readonly Step[];
  readonly text: string;
}

interface Placed {
  readonly folders: { readonly config: string; readonly home: string };
  readonly host: RunnerHost;
  readonly kind: HostKind;
  readonly settings: ServiceSettings;
}

interface Installed {
  readonly file: string;
  readonly installed: true;
  readonly log: string;
  readonly platform: HostKind;
  readonly ran: readonly string[];
  readonly windowsLogonTask?: string;
}

interface Uninstalled {
  readonly file: string;
  readonly platform: HostKind;
  readonly ran: readonly string[];
  readonly removed: boolean;
}

interface Finished {
  readonly command: string;
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

type Spawner = ChildProcessSpawner.ChildProcessSpawner;
type Needs = Spawner | FileSystem.FileSystem | Path.Path;

const LOG = "runner.log";
const SERVICE_FILE = 0o644;
const PRIVATE_FOLDER = 0o700;
const EXIT_SUCCESS = 0;
const BUS_ERROR = "Failed to connect to bus";
const KEEP_WSL_RUNNING = "wsl.exe --exec sleep infinity";
const LOGON_TASK = `In a Windows terminal opened with Run as administrator, run: schtasks /create /tn "cookout runner" /sc onlogon /tr "${KEEP_WSL_RUNNING}". Without administrator rights, add a shortcut to shell:startup whose target is ${KEEP_WSL_RUNNING} instead.`;
const NO_LOGON_TASK = {};

const noHome: CallFailure = {
  code: "state_folder_missing",
  message: "Set HOME so install has a home folder to put the service in, and a state folder for the runner.",
};

function busMissing(command: string): CallFailure {
  return {
    code: "systemd_user_bus_missing",
    message:
      `${command} couldn't reach your systemd (${BUS_ERROR}). On WSL2 that lasts until linger is on: install has ` +
      "run `loginctl enable-linger`, so run `wsl.exe --shutdown` in Windows, open WSL again, and run cookout " +
      "runner install again.",
  };
}

function commandFailed(command: string, detail: string): CallFailure {
  return { code: "service_command_failed", message: `${command} failed: ${detail}` };
}

function must(...argv: Argv): Step {
  return { argv, mayFail: false };
}

function enableLinger(uid: number): Step {
  const lingerOn = { argv: ["loginctl", "show-user", String(uid), "-p", "Linger"] as const, prints: "Linger=yes" };
  return { ...must("loginctl", "enable-linger"), skipWhen: lingerOn };
}

function systemdService({ folders, host, kind, settings }: Placed, path: Path.Path): Service {
  return {
    afterRemove: [must("systemctl", "--user", "daemon-reload")],
    file: path.join(folders.config, "systemd", "user", UNIT),
    install: [
      enableLinger(host.uid),
      must("systemctl", "--user", "daemon-reload"),
      must("systemctl", "--user", "enable", "--now", UNIT),
    ],
    kind,
    settings,
    stop: [must("systemctl", "--user", "disable", "--now", UNIT)],
    text: unitText(settings),
  };
}

function launchdService({ folders, host, settings }: Placed, path: Path.Path): Service {
  const domain = `gui/${String(host.uid)}`;
  const file = path.join(folders.home, "Library", "LaunchAgents", `${LABEL}.plist`);
  const bootout: Step = { argv: ["launchctl", "bootout", `${domain}/${LABEL}`], mayFail: true };
  return {
    afterRemove: [],
    file,
    install: [bootout, must("launchctl", "bootstrap", domain, file)],
    kind: "macos",
    settings,
    stop: [bootout],
    text: plistText(settings),
  };
}

function configFolder(path: Path.Path, homeFolder: string): Effect.Effect<string> {
  return Effect.map(Effect.orDie(xdgConfigHome), (folder) =>
    Option.getOrElse(Option.liftPredicate(folder, Str.isNonEmpty), () => path.join(homeFolder, ".config")),
  );
}

const placed: Effect.Effect<Placed, CallFailure, FileSystem.FileSystem | Path.Path> = Effect.gen(function* placeIt() {
  const path = yield* Path.Path;
  const host = yield* Host;
  const kind = yield* hostKind;
  const homeFolder = yield* Effect.orDie(home);
  const stateFolder = yield* stateFolderPath;
  if (Option.isNone(stateFolder) || Str.isEmpty(homeFolder)) {
    return yield* Effect.fail(noHome);
  }
  const config = yield* configFolder(path, homeFolder);
  const settings = { cookout: host.cookout, log: path.join(stateFolder.value, LOG), stateFolder: stateFolder.value };
  return { folders: { config, home: homeFolder }, host, kind, settings };
});

const service: Effect.Effect<Service, CallFailure, FileSystem.FileSystem | Path.Path> = Effect.gen(
  function* serviceOfHost() {
    const path = yield* Path.Path;
    const where = yield* placed;
    if (where.kind === "macos") {
      return launchdService(where, path);
    }
    return systemdService(where, path);
  },
);

function failedWith(command: string) {
  return (error: { readonly message: string }): CallFailure => commandFailed(command, error.message);
}

function textOf<Failure>(stream: Stream.Stream<Uint8Array, Failure>): Effect.Effect<string> {
  return Effect.orElseSucceed(Stream.mkString(Stream.decodeText(stream)), Function.constant(""));
}

function finished(argv: Argv): Effect.Effect<Finished, CallFailure, Spawner> {
  const command = Arr.join(argv, " ");
  return Effect.scoped(
    Effect.gen(function* runServiceCommand() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const path = yield* Effect.orDie(pathVariable);
      const [program, ...args] = argv;
      const run = ChildProcess.make(program, args, { env: { PATH: path }, extendEnv: true });
      const handle = yield* spawner.spawn(run);
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [textOf(handle.stdout), textOf(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      );
      return { command, exitCode, stderr: Str.trim(stderr), stdout };
    }),
  ).pipe(Effect.mapError(failedWith(command)));
}

function judged({ command, exitCode, stderr }: Finished): Effect.Effect<string, CallFailure> {
  if (exitCode === EXIT_SUCCESS) {
    return Effect.succeed(command);
  }
  if (Str.includes(BUS_ERROR)(stderr)) {
    return Effect.fail(busMissing(command));
  }
  return Effect.fail(commandFailed(command, `exit code ${String(exitCode)}: ${stderr}`));
}

function ranStep({ argv, mayFail }: Step): Effect.Effect<string, CallFailure, Spawner> {
  const ran = Effect.flatMap(finished(argv), judged);
  if (mayFail) {
    return Effect.orElseSucceed(ran, () => Arr.join(argv, " "));
  }
  return ran;
}

function alreadyDone({ argv, prints }: Done): Effect.Effect<boolean, never, Spawner> {
  const said = Effect.map(finished(argv), ({ exitCode, stdout }) => {
    const lines = Arr.map(Str.split("\n")(stdout), Str.trim);
    return exitCode === EXIT_SUCCESS && Arr.contains(lines, prints);
  });
  return Effect.orElseSucceed(said, Function.constFalse);
}

function runStep(step: Step): Effect.Effect<readonly string[], CallFailure, Spawner> {
  return Option.match(Option.fromNullishOr(step.skipWhen), {
    onNone: () => Effect.map(ranStep(step), Arr.of),
    onSome: (done) =>
      Effect.flatMap(alreadyDone(done), (skip) => {
        const checked = Arr.join(done.argv, " ");
        if (skip) {
          return Effect.succeed([checked]);
        }
        return Effect.map(ranStep(step), (ran) => [checked, ran]);
      }),
  });
}

function runSteps(steps: readonly Step[]): Effect.Effect<readonly string[], CallFailure, Spawner> {
  return Effect.map(Effect.forEach(steps, runStep, { concurrency: 1 }), Arr.flatten);
}

function ensureStateFolder(folder: string): Effect.Effect<void, CallFailure, FileSystem.FileSystem> {
  return Effect.gen(function* makeStateFolder() {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* checkFolder({ folder, fs });
    if (!exists) {
      yield* Effect.orDie(fs.makeDirectory(folder, { mode: PRIVATE_FOLDER, recursive: true }));
    }
  });
}

function writeService(found: Service): Effect.Effect<void, CallFailure, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* writeServiceFile() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* ensureStateFolder(found.settings.stateFolder);
    yield* Effect.orDie(fs.makeDirectory(path.dirname(found.file), { recursive: true }));
    yield* Effect.orDie(fs.writeFileString(found.file, found.text, { mode: SERVICE_FILE }));
  });
}

function logonTask(kind: HostKind): { readonly windowsLogonTask?: string } {
  if (kind === "wsl2") {
    return { windowsLogonTask: LOGON_TASK };
  }
  return NO_LOGON_TASK;
}

const install: Effect.Effect<Installed, CallFailure, Needs> = Effect.gen(function* installService() {
  const found = yield* service;
  if (found.kind === "wsl2") {
    yield* wslSystemdOn;
  }
  yield* writeService(found);
  const ran = yield* runSteps(found.install);
  const { log } = found.settings;
  return { file: found.file, installed: true as const, log, platform: found.kind, ran, ...logonTask(found.kind) };
});

const uninstall: Effect.Effect<Uninstalled, CallFailure, Needs> = Effect.gen(function* uninstallService() {
  const fs = yield* FileSystem.FileSystem;
  const found = yield* service;
  const there = yield* Effect.orDie(fs.exists(found.file));
  if (!there) {
    return { file: found.file, platform: found.kind, ran: [], removed: false };
  }
  const stopped = yield* runSteps(found.stop);
  yield* Effect.orDie(fs.remove(found.file, { force: true }));
  const reloaded = yield* runSteps(found.afterRemove);
  return { file: found.file, platform: found.kind, ran: [...stopped, ...reloaded], removed: true };
});

export { install, uninstall };

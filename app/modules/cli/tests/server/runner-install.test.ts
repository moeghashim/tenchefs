import { Array as Arr, Effect, FileSystem, Option, Path, Record, String as Str } from "effect";
import type { CliResult, CommandLineNeeds, ServiceHost, ServiceHostOptions } from "../../../testing/server.ts";
import {
  agentSessionTokenIn,
  boardAgent,
  commandLineServices,
  runCookout,
  serviceHost,
  testCookout,
  wakeBoard,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

interface Platform {
  readonly file: readonly string[];
  readonly install: readonly string[];
  readonly name: string;
  readonly options: ServiceHostOptions;
  readonly uninstall: readonly string[];
}

interface Installed {
  readonly calls: readonly string[];
  readonly file: string;
  readonly on: ServiceHost;
  readonly result: CliResult;
  readonly text: string;
}

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const PRIVATE_FOLDER = 0o700;
const PERMISSIONS = 0o1000;
const UNIT = "cookout-runner.service";
const PLIST_LABEL = "dev.cookout.runner";
const BUS_ERROR = "Failed to connect to bus: No medium found";
const UNIT_FILE = [".config", "systemd", "user", UNIT];

const linux: Platform = {
  file: UNIT_FILE,
  install: ["loginctl enable-linger", "systemctl --user daemon-reload", `systemctl --user enable --now ${UNIT}`],
  name: "Linux",
  options: { osRelease: "6.8.0-45-generic\n", platform: "linux" },
  uninstall: [`systemctl --user disable --now ${UNIT}`, "systemctl --user daemon-reload"],
};

const wsl: Platform = {
  ...linux,
  name: "WSL2",
  options: { osRelease: "6.6.87.2-microsoft-standard-WSL2\n", platform: "linux", wslConf: "[boot]\nsystemd=true\n" },
};

const macos: Platform = {
  file: ["Library", "LaunchAgents", `${PLIST_LABEL}.plist`],
  install: [`launchctl bootout gui/501/${PLIST_LABEL}`, "launchctl bootstrap gui/501 <file>"],
  name: "macOS",
  options: { platform: "darwin" },
  uninstall: [`launchctl bootout gui/501/${PLIST_LABEL}`],
};

function run(
  on: ServiceHost,
  verb: "install" | "uninstall",
  env: Readonly<Record<string, string>> = on.env,
): Effect.Effect<CliResult, never, CommandLineNeeds> {
  return runCookout({ args: ["runner", verb], env, runnerHost: on.host });
}

function textOf(file: string): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) =>
    Effect.orDie(
      Effect.flatMap(fs.exists(file), (there) => Effect.when(fs.readFileString(file), Effect.succeed(there))),
    ),
  );
}

function withFile(calls: readonly string[], file: string): readonly string[] {
  return Arr.map(calls, Str.replace("<file>", file));
}

function installedIn(
  on: ServiceHost,
  file: readonly string[],
): Effect.Effect<Installed, never, CommandLineNeeds | Scope.Scope> {
  return Effect.gen(function* installOnHost() {
    const path = yield* Path.Path;
    const result = yield* run(on, "install");
    const serviceFile = path.join(on.home, ...file);
    const text = yield* textOf(serviceFile);
    const calls = yield* on.calls;
    return { calls, file: serviceFile, on, result, text: Option.getOrElse(text, () => "") };
  });
}

function installedOn(
  options: ServiceHostOptions,
  file: readonly string[],
): Effect.Effect<Installed, never, CommandLineNeeds | Scope.Scope> {
  return Effect.flatMap(serviceHost(options), (on) => installedIn(on, file));
}

it.effect.each([linux, wsl, macos])(
  "on $name, install writes a service that runs the runner with the state folder, and starts it",
  (platform: Platform) =>
    Effect.gen(function* install() {
      const { calls, file, on, result, text } = yield* installedOn(platform.options, platform.file);

      expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { file, installed: true } });
      expect(text).toContain(on.stateFolder);
      expect(text).toContain("/opt/cookout/bin/cookout");
      expect(calls).toStrictEqual(withFile(platform.install, file));
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect.each([linux, wsl, macos])("on $name, uninstall stops the service and removes it", (platform: Platform) =>
  Effect.gen(function* uninstall() {
    const { calls, file, on } = yield* installedOn(platform.options, platform.file);
    const result = yield* run(on, "uninstall");
    const left = yield* textOf(file);
    const after = yield* on.calls;

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { file, removed: true } });
    expect(left).toStrictEqual(Option.none());
    expect(Arr.drop(after, calls.length)).toStrictEqual(platform.uninstall);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect.each([linux, wsl, macos])(
  "on $name, installing twice and uninstalling twice is harmless",
  (platform: Platform) =>
    Effect.gen(function* twice() {
      const { file, on } = yield* installedOn(platform.options, platform.file);
      const again = yield* run(on, "install");
      yield* run(on, "uninstall");
      const before = yield* on.calls;
      const removedAgain = yield* run(on, "uninstall");
      const after = yield* on.calls;

      expect(again).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { file, installed: true } });
      expect(removedAgain).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { file, removed: false } });
      expect(after).toStrictEqual(before);
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the systemd unit runs `cookout runner start` with the state folder and logs to a file under it", () =>
  Effect.gen(function* unitText() {
    const { on, text } = yield* installedOn(linux.options, UNIT_FILE);

    expect(text).toContain('ExecStart="/opt/node/bin/node" "/opt/cookout/bin/cookout" runner start');
    expect(text).toContain(`Environment="COOKOUT_STATE_DIR=${on.stateFolder}"`);
    expect(text).toContain(`StandardOutput=append:${on.stateFolder}/runner.log`);
    expect(text).toContain("WantedBy=default.target");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the launchd plist runs at load, is kept alive, and logs to a file under the state folder", () =>
  Effect.gen(function* plistText() {
    const { on, text } = yield* installedOn(macos.options, macos.file);

    expect(text).toContain("<key>RunAtLoad</key>\n  <true/>\n  <key>KeepAlive</key>\n  <true/>");
    expect(text).toContain(`<key>COOKOUT_STATE_DIR</key>\n    <string>${on.stateFolder}</string>`);
    expect(text).toContain(`<key>StandardOutPath</key>\n  <string>${on.stateFolder}/runner.log</string>`);
    expect(text).toContain("<string>runner</string>\n    <string>start</string>");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("on WSL2, install prints the Windows logon task that starts WSL", () =>
  Effect.gen(function* logonTask() {
    const { result } = yield* installedOn(wsl.options, UNIT_FILE);

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { platform: "wsl2" } });
    expect(result.stdoutJson).toHaveProperty("windowsLogonTask");
    expect(result.stdout).toContain("wsl.exe");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect.each([
  { how: "no /etc/wsl.conf", options: { osRelease: "5.15-microsoft", platform: "linux" } },
  { how: "systemd=false", options: { ...wsl.options, wslConf: "[boot]\nsystemd=false\n" } },
  { how: "systemd=true outside [boot]", options: { ...wsl.options, wslConf: "[network]\nsystemd=true\n" } },
])(
  "on WSL2 with $how, install writes nothing and says how to turn systemd on",
  ({ options }: { readonly options: ServiceHostOptions }) =>
    Effect.gen(function* systemdOff() {
      const { calls, result, text } = yield* installedOn(options, UNIT_FILE);

      expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "wsl_systemd_off" } } });
      expect(result.stderr).toContain("systemd=true");
      expect(text).toBe("");
      expect(calls).toStrictEqual([]);
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect("when systemctl --user can't reach the bus, install says linger must be on", () =>
  Effect.gen(function* busMissing() {
    const { result } = yield* installedOn(
      { ...wsl.options, failing: { command: "systemctl", stderr: BUS_ERROR } },
      UNIT_FILE,
    );

    expect(result).toMatchObject({
      exitCode: EXIT_FAILURE,
      stderrJson: { error: { code: "systemd_user_bus_missing" } },
    });
    expect(result.stderr).toContain("linger");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("a service command that fails otherwise is service_command_failed, naming it and its error", () =>
  Effect.gen(function* commandFailed() {
    const failing = { command: "launchctl", stderr: "Bootstrap failed: 5" };
    const { result } = yield* installedOn({ ...macos.options, failing }, macos.file);

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "service_command_failed" } } });
    expect(result.stderr).toContain("launchctl bootstrap");
    expect(result.stderr).toContain("Bootstrap failed: 5");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("install and uninstall on a platform with no service manager they know are unsupported_platform", () =>
  Effect.gen(function* unsupported() {
    const { on, result } = yield* installedOn({ platform: "win32" }, UNIT_FILE);
    const removed = yield* run(on, "uninstall");

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "unsupported_platform" } } });
    expect(removed).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "unsupported_platform" } } });
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("the unit holds no token of an agent joined in the state folder", () =>
  Effect.gen(function* noToken() {
    const on = yield* serviceHost(linux.options);
    const board = yield* wakeBoard;
    const brigid = yield* boardAgent({ board: { ...board, folder: on.stateFolder }, name: "brigid" });
    const joined = yield* runCookout({ args: ["join", "--as", "brigid"], env: brigid.env });
    const token = yield* agentSessionTokenIn(on.stateFolder);
    const { text } = yield* installedIn(on, UNIT_FILE);

    expect(joined).toMatchObject({ exitCode: EXIT_SUCCESS });
    expect(Option.isSome(token)).toBe(true);
    expect(text).not.toContain(Option.getOrElse(token, () => "no token"));
    expect(text).not.toContain(brigid.agent.token);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("uninstall with nothing installed does nothing on this machine's own platform", () =>
  Effect.gen(function* thisMachine() {
    const on = yield* serviceHost(linux.options);
    const result = yield* runCookout({ args: ["runner", "uninstall"], env: on.env });
    const calls = yield* on.calls;

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { ran: [], removed: false } });
    expect(calls).toStrictEqual([]);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect.each([
  { how: "no HOME, XDG_STATE_HOME or COOKOUT_STATE_DIR", stateFolder: false },
  { how: "a COOKOUT_STATE_DIR but no HOME", stateFolder: true },
])("install with $how is refused with state_folder_missing", ({ stateFolder }: { readonly stateFolder: boolean }) =>
  Effect.gen(function* noHome() {
    const on = yield* serviceHost(linux.options);
    const env = { ...Record.filter({ COOKOUT_STATE_DIR: on.stateFolder }, () => stateFolder), PATH: on.env.PATH };
    const result = yield* run(on, "install", env);
    const calls = yield* on.calls;

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "state_folder_missing" } } });
    expect(calls).toStrictEqual([]);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("a service command that isn't there is service_command_failed, naming it", () =>
  Effect.gen(function* commandMissing() {
    const on = yield* serviceHost(macos.options);
    const result = yield* run(on, "install", { ...on.env, PATH: on.home });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "service_command_failed" } } });
    expect(result.stderr).toContain("launchctl bootstrap");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("install makes a state folder that isn't there yet, one only you can open", () =>
  Effect.gen(function* newStateFolder() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const on = yield* serviceHost(linux.options);
    const folder = path.join(on.home, "new-state");
    const result = yield* run(on, "install", { ...on.env, COOKOUT_STATE_DIR: folder });
    const made = yield* Effect.orDie(fs.stat(folder));

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { log: path.join(folder, "runner.log") } });
    expect(made.mode % PERMISSIONS).toBe(PRIVATE_FOLDER);
  }).pipe(Effect.provide(commandLineServices)),
);

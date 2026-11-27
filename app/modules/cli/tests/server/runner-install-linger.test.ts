import type { CliResult, CommandLineNeeds, ServiceHostOptions } from "../../../testing/server.ts";
import { commandLineServices, runCookout, serviceHost } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { Scope } from "effect";

interface Installed {
  readonly calls: readonly string[];
  readonly result: CliResult;
}

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const UNIT = "cookout-runner.service";
const SHOW_LINGER = "loginctl show-user 501 -p Linger";
const ENABLE_LINGER = "loginctl enable-linger";
const START = ["systemctl --user daemon-reload", `systemctl --user enable --now ${UNIT}`];
const NO_DEVICE = { command: ENABLE_LINGER, stderr: "Could not enable linger: No such device or address" };

const linux: ServiceHostOptions = { osRelease: "6.8.0-45-generic\n", platform: "linux" };
const wsl: ServiceHostOptions = {
  osRelease: "6.6.87.2-microsoft-standard-WSL2\n",
  platform: "linux",
  wslConf: "[boot]\nsystemd=true\n",
};

function installedOn(options: ServiceHostOptions): Effect.Effect<Installed, never, CommandLineNeeds | Scope.Scope> {
  return Effect.gen(function* installOnHost() {
    const on = yield* serviceHost(options);
    const result = yield* runCookout({ args: ["runner", "install"], env: on.env, runnerHost: on.host });
    const calls = yield* on.calls;
    return { calls, result };
  });
}

it.effect.each([
  { name: "Linux", options: linux },
  { name: "WSL2", options: wsl },
])(
  "on $name with linger already on, install doesn't turn it on again and starts the service",
  ({ options }: { readonly options: ServiceHostOptions }) =>
    Effect.gen(function* lingerOn() {
      const { calls, result } = yield* installedOn({ ...options, failing: NO_DEVICE, linger: true });

      expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { installed: true } });
      expect(calls).toStrictEqual([SHOW_LINGER, ...START]);
    }).pipe(Effect.provide(commandLineServices)),
);

it.effect("on WSL2 with linger already on, install still prints the Windows logon task", () =>
  Effect.gen(function* lingerOnLogonTask() {
    const { result } = yield* installedOn({ ...wsl, failing: NO_DEVICE, linger: true });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { platform: "wsl2" } });
    expect(result.stdoutJson).toHaveProperty("windowsLogonTask");
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("with linger off, install turns it on and then starts the service", () =>
  Effect.gen(function* lingerOff() {
    const { calls, result } = yield* installedOn({ ...linux, linger: false });

    expect(result).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { installed: true } });
    expect(calls).toStrictEqual([SHOW_LINGER, ENABLE_LINGER, ...START]);
  }).pipe(Effect.provide(commandLineServices)),
);

it.effect("with linger off and enable-linger failing, install is service_command_failed and starts nothing", () =>
  Effect.gen(function* lingerFails() {
    const { calls, result } = yield* installedOn({ ...linux, failing: NO_DEVICE, linger: false });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "service_command_failed" } } });
    expect(result.stderr).toContain("loginctl enable-linger failed");
    expect(result.stderr).toContain("No such device or address");
    expect(calls).toStrictEqual([SHOW_LINGER, ENABLE_LINGER]);
  }).pipe(Effect.provide(commandLineServices)),
);

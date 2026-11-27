import { Array as Arr, Effect, FileSystem, String as Str } from "effect";
import type { CallFailure } from "./adapters/sdk.ts";
import { RunnerHost } from "./host.ts";

type HostKind = "linux" | "macos" | "wsl2";

const BOOT_SECTION = "[boot]";
const SYSTEMD_ON = /^systemd\s*=\s*true$/iu;

function unsupported(platform: string): CallFailure {
  return {
    code: "unsupported_platform",
    message: `cookout runner install knows systemd (Linux, WSL2) and launchd (macOS), not ${platform}. Run cookout runner start yourself.`,
  };
}

function systemdOff(wslConf: string): CallFailure {
  return {
    code: "wsl_systemd_off",
    message:
      `systemd is off in ${wslConf}. Add the two lines "[boot]" and "systemd=true" to it (with sudo), run ` +
      "`wsl.exe --shutdown` in Windows, open WSL again, and run cookout runner install again.",
  };
}

function readIfThere(file: string): Effect.Effect<string, never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orElseSucceed(fs.readFileString(file), () => ""));
}

interface Section {
  readonly on: boolean;
  readonly section: string;
}

function readLine({ on, section }: Section, raw: string): Section {
  const line = Str.trim(raw);
  if (Str.startsWith("[")(line)) {
    return { on, section: Str.toLowerCase(line) };
  }
  return { on: on || (section === BOOT_SECTION && SYSTEMD_ON.test(line)), section };
}

function systemdOnIn(text: string): boolean {
  return Arr.reduce(Str.split("\n")(text), { on: false, section: "" }, readLine).on;
}

function kindOfLinux(host: RunnerHost): Effect.Effect<HostKind, never, FileSystem.FileSystem> {
  return Effect.map(readIfThere(host.osRelease), (release) => {
    if (Str.includes("microsoft")(Str.toLowerCase(release))) {
      return "wsl2";
    }
    return "linux";
  });
}

const wslSystemdOn: Effect.Effect<void, CallFailure, FileSystem.FileSystem> = Effect.gen(function* checkWslConf() {
  const host = yield* RunnerHost;
  const text = yield* readIfThere(host.wslConf);
  if (!systemdOnIn(text)) {
    return yield* Effect.fail(systemdOff(host.wslConf));
  }
  return yield* Effect.void;
});

const hostKind: Effect.Effect<HostKind, CallFailure, FileSystem.FileSystem> = Effect.gen(function* findHostKind() {
  const host = yield* RunnerHost;
  if (host.platform === "darwin") {
    return "macos";
  }
  if (host.platform !== "linux") {
    return yield* Effect.fail(unsupported(host.platform));
  }
  return yield* kindOfLinux(host);
});

export { type HostKind, hostKind, wslSystemdOn };

import { Array as Arr, Effect, FileSystem, Function, Option, Path, Schema, String as Str } from "effect";
import type { Lookup } from "./claude-code-sessions.ts";
import type { Registration } from "./registrations.ts";
import { lookUp } from "./claude-code-sessions.ts";
import { stateJson } from "./agent-session-state.ts";

type Inbound = "accept" | "hold" | "refuse";

interface InboundWarning {
  readonly crossSessionInbound: Exclude<Inbound, "accept">;
  readonly fix: string;
}

const PermissionsSchema = Schema.Struct({ defaultMode: Schema.optionalKey(Schema.String) });

const SettingsSchema = Schema.Struct({
  crossSessionInbound: Schema.optionalKey(Schema.String),
  permissions: Schema.optionalKey(PermissionsSchema),
});

type Settings = typeof SettingsSchema.Type;

interface Launch {
  readonly bypass: boolean;
  readonly settings: Settings;
}

interface Sources {
  readonly flag: Settings;
  readonly local: Settings;
  readonly managed: Settings;
  readonly project: Settings;
  readonly user: Settings;
}

type Files = FileSystem.FileSystem | Path.Path;

const ACCEPT_LAUNCH_LINE = `claude --settings '{"crossSessionInbound":"accept"}'`;
const SETTINGS_FLAG = "--settings";
const PERMISSION_MODE_FLAG = "--permission-mode";
const SKIP_PERMISSIONS_FLAG = "--dangerously-skip-permissions";
const BYPASS = "bypassPermissions";
const NEXT = 1;
const MANAGED_SETTINGS: Readonly<Record<string, string>> = {
  darwin: "/Library/Application Support/ClaudeCode/managed-settings.json",
  linux: "/etc/claude-code/managed-settings.json",
};
const inbounds: ReadonlySet<string> = new Set(["accept", "hold", "refuse"]);
const noSettings: Settings = {};

const decodeSettings = stateJson(SettingsSchema);

function isInbound(value: string): value is Inbound {
  return inbounds.has(value);
}

function settingsText(text: string): Effect.Effect<Settings> {
  return Effect.map(decodeSettings(text), Option.getOrElse(Function.constant(noSettings)));
}

function settingsIn(file: string): Effect.Effect<Settings, never, FileSystem.FileSystem> {
  return Effect.gen(function* readSettings() {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* Effect.orElseSucceed(fs.readFileString(file), Function.constant(""));
    return yield* settingsText(text);
  });
}

function valueAfter(args: readonly string[], flag: string): Option.Option<string> {
  const joined = Arr.findFirst(args, Str.startsWith(`${flag}=`));
  if (Option.isSome(joined)) {
    return Option.some(Str.slice(flag.length + NEXT)(joined.value));
  }
  return Option.flatMap(
    Arr.findFirstIndex(args, (arg) => arg === flag),
    (at) => Arr.get(args, at + NEXT),
  );
}

function flagSettings(value: string): Effect.Effect<Settings, never, FileSystem.FileSystem> {
  if (Str.startsWith("{")(Str.trim(value))) {
    return settingsText(value);
  }
  return settingsIn(value);
}

function commandLineOf(pid: Option.Option<number>): Effect.Effect<readonly string[], never, FileSystem.FileSystem> {
  return Effect.gen(function* readCommandLine() {
    const fs = yield* FileSystem.FileSystem;
    const file = Option.map(pid, (running) => `/proc/${String(running)}/cmdline`);
    const text = yield* Option.match(file, {
      onNone: () => Effect.succeed(""),
      onSome: (cmdline) => Effect.orElseSucceed(fs.readFileString(cmdline), Function.constant("")),
    });
    return Arr.filter(Str.split(text, "\0"), Str.isNonEmpty);
  });
}

function launchOf(pid: Option.Option<number>): Effect.Effect<Launch, never, FileSystem.FileSystem> {
  return Effect.gen(function* launchFlags() {
    const args = yield* commandLineOf(pid);
    const bypass =
      Arr.contains(args, SKIP_PERMISSIONS_FLAG) || Option.contains(valueAfter(args, PERMISSION_MODE_FLAG), BYPASS);
    const settings = yield* Option.match(valueAfter(args, SETTINGS_FLAG), {
      onNone: () => Effect.succeed(noSettings),
      onSome: flagSettings,
    });
    return { bypass, settings };
  });
}

function inboundOf(settings: Settings): Option.Option<Inbound> {
  return Option.filter(Option.fromUndefinedOr(settings.crossSessionInbound), isInbound);
}

function refuses(settings: Settings): boolean {
  return Option.contains(inboundOf(settings), "refuse");
}

function effectiveInbound({ flag, local, managed, project, user }: Sources): Option.Option<Inbound> {
  return Option.firstSomeOf([
    inboundOf(managed),
    Option.flatMap(Arr.findFirst([local, project], refuses), inboundOf),
    inboundOf(flag),
    Option.flatMap(Option.liftPredicate(user, refuses), inboundOf),
    inboundOf(local),
    inboundOf(project),
    inboundOf(user),
  ]);
}

function defaultModeOf(settings: Settings): Option.Option<string> {
  return Option.flatMap(Option.fromUndefinedOr(settings.permissions), ({ defaultMode }) =>
    Option.fromUndefinedOr(defaultMode),
  );
}

function bypasses({ flag, local, managed, project, user }: Sources, launch: Launch): boolean {
  const mode = Option.firstSomeOf(Arr.map([managed, flag, local, project, user], defaultModeOf));
  return launch.bypass || Option.contains(mode, BYPASS);
}

function warningOf(sources: Sources, launch: Launch): Option.Option<InboundWarning> {
  const byDefault = Option.liftPredicate<Inbound>("hold", () => bypasses(sources, launch));
  const held = Option.orElse(effectiveInbound(sources), () => byDefault);
  return Option.flatMap(held, (crossSessionInbound) => {
    if (crossSessionInbound === "accept") {
      return Option.none();
    }
    return Option.some({ crossSessionInbound, fix: ACCEPT_LAUNCH_LINE });
  });
}

function managedSettings(): Effect.Effect<Settings, never, FileSystem.FileSystem> {
  const file = Option.fromUndefinedOr(MANAGED_SETTINGS[process.platform]);
  return Option.match(file, { onNone: Function.constant(Effect.succeed(noSettings)), onSome: settingsIn });
}

function sourcesFor(cwd: string, folder: string, launch: Launch): Effect.Effect<Sources, never, Files> {
  return Effect.gen(function* readSources() {
    const path = yield* Path.Path;
    const local = yield* settingsIn(path.join(cwd, ".claude", "settings.local.json"));
    const project = yield* settingsIn(path.join(cwd, ".claude", "settings.json"));
    const user = yield* settingsIn(path.join(folder, "settings.json"));
    const managed = yield* managedSettings();
    return { flag: launch.settings, local, managed, project, user };
  });
}

function warningFor(registration: Registration) {
  return ({ folder, open }: Lookup): Effect.Effect<Option.Option<InboundWarning>, never, Files> =>
    Effect.gen(function* warnOnHeldMessages() {
      if (Option.isNone(folder)) {
        return Option.none();
      }
      const cwd = Option.getOrElse(
        Option.flatMap(open, (session) => Option.fromUndefinedOr(session.cwd)),
        () => registration.directory,
      );
      const launch = yield* launchOf(Option.map(open, ({ pid }) => pid));
      const sources = yield* sourcesFor(cwd, folder.value, launch);
      return warningOf(sources, launch);
    });
}

function inboundWarning(registration: Registration): Effect.Effect<Option.Option<InboundWarning>, never, Files> {
  return Effect.flatMap(lookUp(registration), warningFor(registration));
}

export { type InboundWarning, inboundWarning };

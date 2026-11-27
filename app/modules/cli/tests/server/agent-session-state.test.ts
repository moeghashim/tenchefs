import { Array as Arr, Effect, FileSystem, String as Str, pipe } from "effect";
import {
  TestCookout,
  agentSessionStateFiles,
  commandLineServices,
  freshStateFolder,
  runCookout,
  testCookout,
  writeAgentSessionStates,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { CommandLineNeeds } from "../../../testing/server.ts";
import type { Scope } from "effect";

const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const SHARED_FILE = 0o644;
const OPEN_FOLDER = 0o755;
const WINDOWS_FOLDER = 0o777;
const WINDOWS_HOST = { cookout: [], osRelease: "", platform: "win32", uid: 0, wslConf: "" } as const;
const unsafe = { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "agent_session_state_unsafe" } } };
const OWNER_ONLY = "600";
const OCTAL = 8;
const PERMISSION_DIGITS = -3;
const ONE_AT_A_TIME = { concurrency: 1 } as const;
const ONE_FILE = 1;
const SESSION = { CLAUDECODE: "1", CLAUDE_CODE_SESSION_ID: "s1" } as const;
const JOIN = ["join", "--as", "agent"];
const DAMAGED = "is damaged. Delete it and join again.";
const damaged = { exitCode: EXIT_FAILURE, stderrJson: { error: { code: "agent_session_state_damaged" } } };
const brokenStates = [
  "{",
  '{"expiresAt":"tomorrow","identity":"agent","agentSessionToken":"cookout_test_3","issuedAt":"2026-01-01T00:00:00.000Z","url":"http://x"}',
  '{"expiresAt":"2026-01-01T00:01:00.000Z","identity":"Not A Name","agentSessionToken":"cookout_test_3","issuedAt":"2026-01-01T00:00:00.000Z","url":"http://x"}',
];

function permissionsOf(file: string): Effect.Effect<string, never, FileSystem.FileSystem> {
  return Effect.gen(function* readPermissions() {
    const fs = yield* FileSystem.FileSystem;
    const { mode } = yield* Effect.orDie(fs.stat(file));
    return Str.slice(PERMISSION_DIGITS)(mode.toString(OCTAL));
  });
}

interface UnsafeStateFolders {
  readonly linked: string;
  readonly open: string;
  readonly target: string;
}

const unsafeStateFolders: Effect.Effect<UnsafeStateFolders, never, CommandLineNeeds | Scope.Scope> = Effect.gen(
  function* makeUnsafeFolders() {
    const fs = yield* FileSystem.FileSystem;
    const [open, linked, target] = yield* Effect.all(
      [freshStateFolder, freshStateFolder, freshStateFolder],
      ONE_AT_A_TIME,
    );
    yield* Effect.orDie(fs.chmod(open, OPEN_FOLDER));
    yield* Effect.orDie(fs.symlink(target, `${linked}/agent-sessions`));
    return { linked, open, target };
  },
);

function filesIn(folder: string): Effect.Effect<readonly string[], never, FileSystem.FileSystem> {
  return Effect.flatMap(FileSystem.FileSystem, (fs) => Effect.orDie(fs.readDirectory(folder)));
}

function plantSharedTemporary(folder: string): Effect.Effect<string, never, CommandLineNeeds> {
  return Effect.gen(function* plantTemporary() {
    const fs = yield* FileSystem.FileSystem;
    const [file = ""] = yield* agentSessionStateFiles(folder);
    yield* Effect.orDie(fs.writeFileString(`${file}.tmp`, "{}", { mode: SHARED_FILE }));
    return file;
  });
}

it.effect(
  "without COOKOUT_STATE_DIR, join keeps its agent session token under $XDG_STATE_HOME/cookout, else ~/.local/state/cookout",
  () =>
    Effect.gen(function* stateFolderDefaults() {
      const cookout = yield* TestCookout;
      const agent = yield* cookout.createIdentity("agent");
      const other = yield* cookout.createIdentity("other");
      const [xdg, home] = yield* Effect.all([freshStateFolder, freshStateFolder], ONE_AT_A_TIME);
      yield* runCookout({
        args: JOIN,
        env: { ...SESSION, COOKOUT_TOKEN: agent.token, COOKOUT_URL: cookout.url, XDG_STATE_HOME: xdg },
      });
      yield* runCookout({
        args: ["join", "--as", "other"],
        env: { ...SESSION, COOKOUT_TOKEN: other.token, COOKOUT_URL: cookout.url, HOME: home },
      });
      const found = yield* Effect.all(
        [agentSessionStateFiles(`${xdg}/cookout`), agentSessionStateFiles(`${home}/.local/state/cookout`)],
        ONE_AT_A_TIME,
      );

      expect(Arr.map(found, Arr.length)).toStrictEqual([ONE_FILE, ONE_FILE]);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect(
  "join writes its agent session state file readable by its owner only, even beside a stale temporary file",
  () =>
    Effect.gen(function* ownerOnlyState() {
      const cookout = yield* TestCookout;
      const agent = yield* cookout.createIdentity("agent");
      const folder = yield* freshStateFolder;
      const env = { ...SESSION, COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: agent.token, COOKOUT_URL: cookout.url };
      yield* runCookout({ args: JOIN, env });
      const file = yield* plantSharedTemporary(folder);
      const [, again] = yield* Effect.all(
        [runCookout({ args: ["leave"], env: { ...env, COOKOUT_TOKEN: "" } }), runCookout({ args: JOIN, env })],
        ONE_AT_A_TIME,
      );
      const mode = yield* permissionsOf(file);

      expect(again.exitCode).toBe(EXIT_SUCCESS);
      expect(mode).toBe(OWNER_ONLY);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a state folder others can open, or an agent-sessions folder that is a symlink, is refused as unsafe", () =>
  Effect.gen(function* unsafeFolders() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("agent");
    const { linked, open, target } = yield* unsafeStateFolders;
    const session = { ...SESSION, COOKOUT_TOKEN: agent.token, COOKOUT_URL: cookout.url };
    const results = yield* pipe(
      [open, linked],
      Effect.forEach(
        (folder) => runCookout({ args: JOIN, env: { ...session, COOKOUT_STATE_DIR: folder } }),
        ONE_AT_A_TIME,
      ),
    );
    const written = yield* filesIn(target);

    expect(results).toMatchObject([unsafe, unsafe]);
    expect(written).toStrictEqual([]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("on Windows, which has no POSIX mode bits, join keeps its state in a folder whatever its mode", () =>
  Effect.gen(function* windowsStateFolder() {
    const fs = yield* FileSystem.FileSystem;
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("agent");
    const folder = yield* freshStateFolder;
    yield* Effect.orDie(fs.chmod(folder, WINDOWS_FOLDER));
    const env = { ...SESSION, COOKOUT_STATE_DIR: folder, COOKOUT_URL: cookout.url };
    const joined = yield* runCookout({
      args: JOIN,
      env: { ...env, COOKOUT_TOKEN: agent.token },
      runnerHost: WINDOWS_HOST,
    });
    const whoami = yield* runCookout({ args: ["whoami"], env, runnerHost: WINDOWS_HOST });

    expect([joined, whoami]).toMatchObject([
      { exitCode: EXIT_SUCCESS },
      { exitCode: EXIT_SUCCESS, stdoutJson: { identity: { name: "agent" } } },
    ]);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("with none of HOME, XDG_STATE_HOME or COOKOUT_STATE_DIR set, join is refused and other verbs work", () =>
  Effect.gen(function* noStateFolder() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("agent");
    const env = { ...SESSION, COOKOUT_TOKEN: agent.token, COOKOUT_URL: cookout.url };
    const joined = yield* runCookout({ args: JOIN, env });
    const listed = yield* runCookout({ args: ["channel", "list"], env });

    expect(joined).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "state_folder_missing" } } });
    expect(listed).toMatchObject({ exitCode: EXIT_SUCCESS, stdoutJson: { channels: [] } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("a state folder that can't be made fails join with cli_error", () =>
  Effect.gen(function* folderCantBeMade() {
    const fs = yield* FileSystem.FileSystem;
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("agent");
    const folder = yield* freshStateFolder;
    yield* Effect.orDie(fs.writeFileString(`${folder}/a-file`, ""));
    const env = {
      ...SESSION,
      COOKOUT_STATE_DIR: `${folder}/a-file/state`,
      COOKOUT_TOKEN: agent.token,
      COOKOUT_URL: cookout.url,
    };
    const result = yield* runCookout({ args: JOIN, env });

    expect(result).toMatchObject({ exitCode: EXIT_FAILURE, stderrJson: { error: { code: "cli_error" } } });
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("an agent session state file that isn't JSON, or breaks the expiry or identity rule, is damaged", () =>
  Effect.gen(function* damagedStates() {
    const cookout = yield* TestCookout;
    const agent = yield* cookout.createIdentity("agent");
    const folder = yield* freshStateFolder;
    const env = { ...SESSION, COOKOUT_STATE_DIR: folder, COOKOUT_TOKEN: agent.token, COOKOUT_URL: cookout.url };
    yield* runCookout({ args: JOIN, env });
    const results = yield* pipe(
      brokenStates,
      Effect.forEach(
        (text) =>
          Effect.andThen(
            writeAgentSessionStates({ folder, text }),
            runCookout({ args: ["channel", "list"], env: { ...env, COOKOUT_TOKEN: "" } }),
          ),
        ONE_AT_A_TIME,
      ),
    );

    expect(results).toMatchObject([damaged, damaged, damaged]);
    expect(Arr.every(results, ({ stderr }) => Str.includes(DAMAGED)(stderr))).toBe(true);
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

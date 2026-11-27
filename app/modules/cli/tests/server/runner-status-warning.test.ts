import type { CommandLineNeeds, FakeClaudeSession, TestCookout } from "../../../testing/server.ts";
import { Effect, FileSystem, Path } from "effect";
import {
  claudeCodeHome,
  commandLineServices,
  joinWaking,
  runCookout,
  testCookout,
  wakeBoard,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";

type Needs = CommandLineNeeds | TestCookout | Scope.Scope;
type Session = Omit<FakeClaudeSession, "harnessSession">;

interface Status {
  readonly json: string;
  readonly text: string;
  readonly textExit: number;
}

const BRIGID = "brigid";
const EXITED_PID = 4_194_305;
const EXIT_SUCCESS = 0;
const LAUNCH_LINE = `claude --settings '{"crossSessionInbound":"accept"}'`;
const ACCEPT_JSON = '{"crossSessionInbound":"accept"}';
const BYPASS = "bypassPermissions";
const SKIP_PERMISSIONS = "--dangerously-skip-permissions";

function statusWith(session: Session): Effect.Effect<Status, never, Needs> {
  return Effect.gen(function* statusOfOpenSession() {
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    const brigid = yield* joinWaking({ name: BRIGID, on, settings: { log: path.join(on.folder, "wake.log") } });
    const home = yield* claudeCodeHome({ ...session, harnessSession: brigid.harnessSession });
    const env = { CLAUDE_CONFIG_DIR: home.folder, COOKOUT_STATE_DIR: on.folder };
    const text = yield* runCookout({ args: ["runner", "status"], env });
    const json = yield* runCookout({ args: ["runner", "status", "--json"], env });
    return { json: json.stdout, text: text.stdout, textExit: text.exitCode };
  });
}

it.effect.each([
  { how: "holds them (user settings)", session: { userSettings: { crossSessionInbound: "hold" } }, value: "hold" },
  {
    how: "refuses them (its folder's settings)",
    session: { projectSettings: { crossSessionInbound: "refuse" } },
    value: "refuse",
  },
  {
    how: "bypasses permissions with no crossSessionInbound",
    session: { userSettings: { permissions: { defaultMode: BYPASS } } },
    value: "hold",
  },
  {
    how: "refuses them in its folder over the user's accept",
    session: {
      projectSettings: { crossSessionInbound: "refuse" },
      userSettings: { crossSessionInbound: "accept" },
    },
    value: "refuse",
  },
  {
    how: "is not open and the user settings hold them",
    session: { pid: EXITED_PID, userSettings: { crossSessionInbound: "hold" } },
    value: "hold",
  },
  { how: "was launched skipping permissions", session: { launchedWith: [SKIP_PERMISSIONS] }, value: "hold" },
  { how: "was launched in bypass mode", session: { launchedWith: ["--permission-mode", BYPASS] }, value: "hold" },
  {
    how: "was launched with settings that refuse them",
    session: { launchedWith: ['--settings={"crossSessionInbound":"refuse"}'] },
    value: "refuse",
  },
])(
  "runner status warns when a registered session $how, with the launch line that fixes it",
  ({ session, value }: { readonly session: Session; readonly value: string }) =>
    Effect.gen(function* warned() {
      const { json, text, textExit } = yield* statusWith(session);

      expect(textExit).toBe(EXIT_SUCCESS);
      expect(text).toContain(`would ${value} runner messages`);
      expect(text).toContain(LAUNCH_LINE);
      expect(json).toContain(`"crossSessionInbound": "${value}"`);
    }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect.each([
  { how: "accepts them", session: { userSettings: { crossSessionInbound: "accept" } } },
  { how: "has no setting and prompts for permissions", session: {} },
  {
    how: "bypasses permissions but accepts them",
    session: { userSettings: { crossSessionInbound: "accept", permissions: { defaultMode: BYPASS } } },
  },
  {
    how: "was launched with the fix line over the user's hold",
    session: { launchedWith: ["--settings", ACCEPT_JSON], userSettings: { crossSessionInbound: "hold" } },
  },
])("runner status gives no warning when a registered session $how", ({ session }: { readonly session: Session }) =>
  Effect.gen(function* notWarned() {
    const { json, text, textExit } = yield* statusWith(session);

    expect(textExit).toBe(EXIT_SUCCESS);
    expect(text).not.toContain("runner messages");
    expect(json).not.toContain("crossSessionInbound");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner status gives no warning when a session was launched with a settings file that accepts them", () =>
  Effect.gen(function* acceptedByFile() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const folder = yield* Effect.orDie(fs.makeTempDirectoryScoped({ prefix: "flag-" }));
    const file = path.join(folder, "accept.json");
    yield* Effect.orDie(fs.writeFileString(file, ACCEPT_JSON));
    const { json, text } = yield* statusWith({
      launchedWith: ["--settings", file],
      userSettings: { crossSessionInbound: "hold" },
    });

    expect(text).not.toContain("runner messages");
    expect(json).not.toContain("crossSessionInbound");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

it.effect("runner status gives no warning when there is no Claude Code folder to look in", () =>
  Effect.gen(function* noFolder() {
    const path = yield* Path.Path;
    const on = yield* wakeBoard;
    yield* joinWaking({ name: BRIGID, on, settings: { log: path.join(on.folder, "wake.log") } });
    const json = yield* runCookout({ args: ["runner", "status", "--json"], env: { COOKOUT_STATE_DIR: on.folder } });

    expect(json.exitCode).toBe(EXIT_SUCCESS);
    expect(json.stdout).toContain(BRIGID);
    expect(json.stdout).not.toContain("crossSessionInbound");
  }).pipe(Effect.provide([testCookout(), commandLineServices])),
);

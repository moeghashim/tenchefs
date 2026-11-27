import type { FileSystem, Path, Scope } from "effect";
import type { TestCookout, TestIdentity } from "./cookout.ts";
import { TestCookout as Cookout } from "./cookout.ts";
import { Effect } from "effect";
import { answer } from "./calls.ts";
import { freshStateFolder } from "./agent-sessions.ts";

interface BoardAgent {
  readonly agent: TestIdentity;
  readonly env: Readonly<Record<string, string>>;
  readonly harnessSession: string;
}

interface WakeBoard {
  readonly ada: TestIdentity;
  readonly folder: string;
  readonly url: string;
}

type Needs = FileSystem.FileSystem | Path.Path | TestCookout | Scope.Scope;

const WAKE_CHANNEL = "grill";

const wakeBoard: Effect.Effect<WakeBoard, never, Needs> = Effect.gen(function* boardWithAda() {
  const cookout = yield* Cookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const folder = yield* freshStateFolder;
  yield* answer(() => ada.client.createChannel({ name: WAKE_CHANNEL }));
  return { ada, folder, url: cookout.url };
});

function boardAgent({
  board: { folder, url },
  name,
}: {
  readonly board: WakeBoard;
  readonly name: string;
}): Effect.Effect<BoardAgent, never, TestCookout> {
  return Effect.gen(function* agentOnBoard() {
    const cookout = yield* Cookout;
    const agent = yield* cookout.createIdentity(name, { owner: "ada" });
    const harnessSession = `session-${name}`;
    const env = {
      CLAUDECODE: "1",
      CLAUDE_CODE_SESSION_ID: harnessSession,
      COOKOUT_STATE_DIR: folder,
      COOKOUT_TOKEN: agent.token,
      COOKOUT_URL: url,
      PATH: `${folder}/bin:/usr/bin:/bin`,
    };
    return { agent, env, harnessSession };
  });
}

export { type BoardAgent, type WakeBoard, WAKE_CHANNEL, boardAgent, wakeBoard };

import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fail, unwrap } from "./lib/tools.ts";
import { field, parseJson, text } from "./lib/json.ts";
import type { DevCookout } from "./lib/dev-cookout.ts";
import { optedOutSteps } from "./lib/published-client.ts";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { startDevCookout } from "./lib/dev-cookout.ts";
import { tmpdir } from "node:os";
import { watchConnected } from "./lib/connected-watch.ts";

type Env = Readonly<Record<string, string>>;

interface Answer {
  readonly output: string;
  readonly status: number | null;
  readonly stdout: string;
}

interface Board {
  readonly admin: Env;
  readonly agent: Env;
  readonly url: string;
}

interface Run {
  readonly args: readonly string[];
  readonly bin?: string;
  readonly env: Env;
  readonly node?: readonly string[];
}

const SCRIPT = "published-client";
const PACKAGE = "@ai-hero/cookout";
const OPT_OUTS = "scripts/published-client-opt-outs.json";
const CACHE = "node_modules/.cache/published-client";
const MAX_BUFFER = 67_108_864;
const EXIT_SUCCESS = 0;
const WATCH_TIMEOUT_SECONDS = "30";
const NOTE_TIMEOUT_MS = 30_000;
const MS_PER_SECOND = 1000;
const CHANNEL = "compat";
const AGENT = "compat-agent";
const CANARY_AGENT = "compat-canary";
const WEBHOOK_COMMAND = "compat-command";
const STEPS = [
  "join",
  "post",
  "reply",
  "inbox",
  "ack",
  "watch",
  "command add",
  "command call",
  "deactivate",
  "reactivate",
];
const HARNESS_AND_BOARD = [
  "CLAUDECODE",
  "CLAUDE_CODE_SESSION_ID",
  "CODEX_CI",
  "CODEX_THREAD_ID",
  "COOKOUT_SESSION",
  "COOKOUT_TOKEN",
  "COOKOUT_URL",
];
const DROP_DEACTIVATE_IDENTITY = path.resolve("scripts/drop-deactivate-identity.ts");
const root = mkdtempSync(path.join(tmpdir(), "cookout-published-client-"));
const install = path.join(root, "install");
const publishedBin = path.join(install, "node_modules", ".bin", "cookout");
const currentBin = path.resolve("app/main.ts");
let optedOut: ReadonlySet<string> = new Set();

process.on("exit", () => {
  rmSync(root, { force: true, recursive: true });
});

class StepFailedError extends Error {
  public override readonly name = "StepFailedError";
}

function refuse(message: string): never {
  throw new StepFailedError(message);
}

function run(command: string, args: readonly string[], cwd = "."): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER });
  if (result.error instanceof Error || result.status !== EXIT_SUCCESS) {
    refuse(`${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

function installPublished(): string {
  const version = run("npm", ["view", PACKAGE, "version"]).trim();
  const tarball = path.resolve(CACHE, `cookout-${version}.tgz`);
  if (!existsSync(tarball)) {
    mkdirSync(CACHE, { recursive: true });
    const packed = run("npm", ["pack", `${PACKAGE}@${version}`, "--pack-destination", root, "--silent"]).trim();
    renameSync(path.join(root, packed), tarball);
  }
  mkdirSync(install);
  writeFileSync(path.join(install, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", tarball], install);
  return version;
}

function boardEnv(url: string): Env {
  return {
    COOKOUT_STATE_DIR: path.join(root, "state"),
    COOKOUT_URL: url,
    HOME: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
  };
}

function envArgs({ args, bin = publishedBin, env, node = [] }: Run): string[] {
  const unset = HARNESS_AND_BOARD.flatMap((name) => ["-u", name]);
  const variables = Object.entries(env).map(([name, value]: readonly [string, string]) => `${name}=${value}`);
  return [...unset, ...variables, process.execPath, ...node, bin, ...args];
}

function cli(command: Run): Answer {
  const result = spawnSync("env", envArgs(command), { cwd: install, encoding: "utf8", maxBuffer: MAX_BUFFER });
  return { output: `${result.stdout}${result.stderr}`, status: result.status, stdout: result.stdout };
}

function binFor(name: string): string {
  if (optedOut.has(name)) {
    return currentBin;
  }
  return publishedBin;
}

function passed(name: string, answer: Answer, args: readonly string[]): void {
  if (answer.status !== EXIT_SUCCESS) {
    refuse(`${name}: cookout ${args.join(" ")} failed (exit ${String(answer.status)}):\n${answer.output}`);
  }
  let by = "the published cookout";
  if (optedOut.has(name)) {
    by = `this commit's cookout (the step is opted out in ${OPT_OUTS})`;
  }
  console.log(`ok   ${name}: ${by} ran cookout ${args.join(" ")}`);
}

function step(name: string, env: Env, args: readonly string[]): unknown {
  const answer = cli({ args, bin: binFor(name), env });
  passed(name, answer, args);
  return parseJson(answer.stdout);
}

function asAdmin(args: readonly string[], board: Board): unknown {
  return parseJson(run("env", envArgs({ args, bin: currentBin, env: board.admin }), install));
}

function setUp(cookout: DevCookout): Board {
  const admin = { ...boardEnv(cookout.url), COOKOUT_ALLOW_HUMAN: "1", COOKOUT_TOKEN: cookout.adminToken };
  const board = { admin, agent: {}, url: cookout.url };
  asAdmin(["channel", "create", CHANNEL], board);
  const created = asAdmin(
    ["identity", "create", AGENT, "--kind", "agent", "--owner", "admin", "--display-name", "Canary"],
    board,
  );
  return { ...board, agent: { ...boardEnv(cookout.url), COOKOUT_TOKEN: text(field(created, "token")) ?? "" } };
}

function join(board: Board): Board {
  const args = ["join", "--as", AGENT, "--print-env"];
  const answer = cli({ args, bin: binFor("join"), env: board.agent });
  passed("join", answer, args);
  const [, session = ""] = answer.stdout.trim().split("export COOKOUT_SESSION=");
  if (session === "") {
    refuse(`join: cookout ${args.join(" ")} printed no COOKOUT_SESSION:\n${answer.output}`);
  }
  return { ...board, agent: { ...boardEnv(board.url), COOKOUT_SESSION: session } };
}

function messageId(answer: unknown): string {
  return String(field(field(answer, "message"), "id"));
}

function postAndRead(board: Board): void {
  const posted = messageId(step("post", board.agent, ["message", "post", CHANNEL, "Hello from the published client."]));
  const reply = messageId(
    step("reply", board.admin, ["message", "post", CHANNEL, `@${AGENT} a reply`, "--reply-to", posted]),
  );
  step("inbox", board.agent, ["inbox"]);
  step("ack", board.agent, ["ack", reply]);
}

async function watch(board: Board): Promise<void> {
  const args = ["watch", "--once", "--json", "--timeout", WATCH_TIMEOUT_SECONDS];
  const post = ["message", "post", CHANNEL, `@${AGENT} watch this`];
  const answer = await watchConnected({
    argv: ["env", ...envArgs({ args, bin: binFor("watch"), env: board.agent })],
    cwd: install,
    noteTimeoutMs: NOTE_TIMEOUT_MS,
    onConnected: () => {
      run("env", envArgs({ args: post, bin: currentBin, env: board.admin }), install);
    },
  });
  if (!answer.connected) {
    const waited = `${String(NOTE_TIMEOUT_MS / MS_PER_SECOND)} s`;
    refuse(`watch: cookout ${args.join(" ")} printed no watching note on stderr within ${waited}:\n${answer.output}`);
  }
  passed("watch", answer, args);
  if (!answer.stdout.includes('"type":"inbox-item"')) {
    refuse(`watch: cookout ${args.join(" ")} exited before the mention arrived:\n${answer.output}`);
  }
}

function callWebhookCommand(board: Board): void {
  const schema = path.join(root, "schema.json");
  writeFileSync(schema, JSON.stringify({ properties: { version: { type: "string" } }, type: "object" }));
  const url = "http://127.0.0.1:9/compat";
  step("command add", board.admin, ["command", "add", WEBHOOK_COMMAND, "--url", url, "--schema", schema]);
  step("command call", board.admin, [
    "command",
    "call",
    WEBHOOK_COMMAND,
    "--channel",
    CHANNEL,
    "--data",
    '{"version":"1"}',
  ]);
}

function canary(board: Board): void {
  asAdmin(
    ["identity", "create", CANARY_AGENT, "--kind", "agent", "--owner", "admin", "--display-name", "Canary"],
    board,
  );
  const node = ["--import", DROP_DEACTIVATE_IDENTITY];
  const answer = cli({ args: ["identity", "deactivate", CANARY_AGENT], env: board.admin, node });
  if (answer.status === EXIT_SUCCESS || !answer.output.includes("bad_response")) {
    refuse(`canary: an answer without identity got past the published cookout:\n${answer.output}`);
  }
  console.log("ok   canary: a deactivate answer without identity fails the published cookout with bad_response");
}

async function drive(board: Board): Promise<void> {
  postAndRead(board);
  await watch(board);
  callWebhookCommand(board);
  step("deactivate", board.admin, ["identity", "deactivate", AGENT]);
  step("reactivate", board.admin, ["identity", "reactivate", AGENT]);
  canary(board);
}

async function main(): Promise<void> {
  const version = installPublished();
  console.log(`ok   installed ${PACKAGE}@${version} from npm`);
  const optOuts = parseJson(readFileSync(OPT_OUTS, "utf8"));
  optedOut = unwrap(SCRIPT, optedOutSteps({ optOuts, steps: STEPS, version }));
  const cookout = await startDevCookout({});
  try {
    await drive(join(setUp(cookout)));
  } catch (error) {
    await cookout.stop();
    fail(SCRIPT, String(error));
  }
  await cookout.stop();
}

await main();

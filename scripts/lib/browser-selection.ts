import { everythingReachedBy, isDocs } from "./test-selection.ts";
import { field, list, parseJson, text } from "./json.ts";
import type { CiOnly } from "./check-runner.ts";
import type { CoverageMap } from "./browser-coverage.ts";
import type { Outcome } from "./tools.ts";
import type { Plan } from "./timed-shards.ts";
import type { Span } from "./page-coverage.ts";
import { browserShardPlan } from "./timed-shards.ts";
import path from "node:path";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { testsReaching } from "./browser-coverage.ts";

type BrowserTests =
  | { readonly all: true; readonly reason: string }
  | { readonly all: false; readonly run: readonly string[]; readonly skipped: readonly string[] };

interface History {
  readonly changedLines: (file: string) => Outcome<readonly Span[]>;
  readonly unchangedSince: (commit: string, file: string) => boolean;
}

interface Selecting {
  readonly changed: Outcome<readonly string[]>;
  readonly coverage: () => Outcome<CoverageMap>;
  readonly cwd: string;
  readonly history: History;
}

interface Recorded {
  readonly coverage: Outcome<CoverageMap>;
  readonly history: History;
}

interface Recording {
  readonly coverage: () => Outcome<CoverageMap>;
  readonly history: History;
}

interface ChangeInMap {
  readonly changed: readonly Span[];
  readonly map: CoverageMap;
}

interface ClientChange {
  readonly file: string;
  readonly recorded: Recorded;
  readonly tests: readonly string[];
}

interface Inputs {
  readonly graph: Graph;
  readonly tests: readonly string[];
}

type Graph = ReadonlyMap<string, readonly string[]>;

const BROWSER_TESTS = "app/modules/routes/tests/browser";
const TEST_SUFFIX = ".browser.test.ts";
const SERVER_ROOTS = ["app/dev.ts", "scripts/browser-test-server.ts"];
const CLIENT_ROOTS = ["app/web.tsx"];
const SHORT_COMMIT = 12;
const INERT_DIRECTORIES = [".github/", "lint/"];
const INERT_FILES = new Set(["lint-baseline.json"]);
const EXIT_SUCCESS = 0;
const NONE = 0;
const MAX_BUFFER = 268_435_456;

function graphOf(json: unknown): Graph {
  const modules = list(field(json, "modules")) ?? [];
  return new Map(
    modules.map((module) => [
      text(field(module, "source")) ?? "",
      (list(field(module, "dependencies")) ?? []).map((dependency) => text(field(dependency, "resolved")) ?? ""),
    ]),
  );
}

function moduleGraph(cwd: string): Outcome<Graph> {
  const ran = spawnSync(
    path.join(cwd, "node_modules/.bin/depcruise"),
    ["app", "scripts", "--output-type", "json", "--cache", "node_modules/.cache/depcruise-browser"],
    { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER },
  );
  if (ran.status !== EXIT_SUCCESS) {
    return { ok: false, reason: `dependency-cruiser couldn't build the module graph: ${ran.stderr.trim()}` };
  }
  const graph = graphOf(parseJson(ran.stdout));
  if (graph.size === NONE) {
    return { ok: false, reason: "dependency-cruiser listed no modules" };
  }
  return { ok: true, value: graph };
}

function browserTestFiles(cwd: string): Outcome<readonly string[]> {
  try {
    const files = readdirSync(path.join(cwd, BROWSER_TESTS)).filter((file) => file.endsWith(TEST_SUFFIX));
    return { ok: true, value: files.map((file) => `${BROWSER_TESTS}/${file}`).toSorted() };
  } catch (error) {
    return { ok: false, reason: `the browser tests couldn't be listed: ${String(error)}` };
  }
}

function inputsIn(cwd: string): Outcome<Inputs> {
  const tests = browserTestFiles(cwd);
  if (!tests.ok) {
    return tests;
  }
  const graph = moduleGraph(cwd);
  if (!graph.ok) {
    return graph;
  }
  return { ok: true, value: { graph: graph.value, tests: tests.value } };
}

function reachedFrom(graph: Graph, roots: readonly string[]): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = [...roots];
  while (pending.length > NONE) {
    const file = pending.pop() ?? "";
    if (!reached.has(file)) {
      reached.add(file);
      pending.push(...(graph.get(file) ?? []));
    }
  }
  return reached;
}

function inert(file: string): boolean {
  return isDocs(file) || INERT_FILES.has(file) || INERT_DIRECTORIES.some((directory) => file.startsWith(directory));
}

function unknownChange(changed: readonly string[], graph: Graph): string {
  const server = reachedFrom(graph, SERVER_ROOTS);
  for (const file of changed) {
    if (server.has(file)) {
      return `${file} is part of the cookout server every browser test drives`;
    }
    if (!graph.has(file) && !inert(file)) {
      return `the module graph doesn't hold ${file}`;
    }
  }
  return "";
}

function everythingReason(changed: readonly string[], graph: Graph): string {
  const everything = everythingReachedBy(changed);
  if (everything !== "") {
    return everything;
  }
  return unknownChange(changed, graph);
}

function freshMap(file: string, { coverage, history }: Recorded): Outcome<CoverageMap> {
  if (!coverage.ok) {
    return { ok: false, reason: `there's no browser coverage map: ${coverage.reason}` };
  }
  const { commit } = coverage.value;
  if (!history.unchangedSince(commit, file)) {
    return { ok: false, reason: `${file} changed since the coverage map's commit ${commit.slice(NONE, SHORT_COMMIT)}` };
  }
  return coverage;
}

function changesIn(file: string, recorded: Recorded): Outcome<ChangeInMap> {
  const map = freshMap(file, recorded);
  if (!map.ok) {
    return map;
  }
  const changed = recorded.history.changedLines(file);
  if (!changed.ok) {
    return changed;
  }
  return { ok: true, value: { changed: changed.value, map: map.value } };
}

function reachedInClient({ file, recorded, tests }: ClientChange): Outcome<readonly string[]> {
  const change = changesIn(file, recorded);
  if (!change.ok) {
    return change;
  }
  const { changed, map } = change.value;
  const reaching = testsReaching({ changed, file, map });
  if (!reaching.ok) {
    return reaching;
  }
  const unmapped = tests.filter((test) => !Object.hasOwn(map.tests, test));
  return { ok: true, value: [...reaching.value, ...unmapped] };
}

function reachedInFiles(
  files: readonly string[],
  recorded: Recorded,
  tests: readonly string[],
): Outcome<ReadonlySet<string>> {
  const reached: string[] = [];
  for (const file of files) {
    const reaching = reachedInClient({ file, recorded, tests });
    if (!reaching.ok) {
      return reaching;
    }
    reached.push(...reaching.value);
  }
  return { ok: true, value: new Set(reached) };
}

function reachedByCoverage(
  changed: readonly string[],
  { graph, tests }: Inputs,
  recording: Recording,
): Outcome<ReadonlySet<string>> {
  const client = reachedFrom(graph, CLIENT_ROOTS);
  const inClient = changed.filter((file) => client.has(file));
  if (inClient.length === NONE) {
    return { ok: true, value: new Set() };
  }
  return reachedInFiles(inClient, { coverage: recording.coverage(), history: recording.history }, tests);
}

function selected(changed: readonly string[], inputs: Inputs, recording: Recording): BrowserTests {
  const { graph, tests } = inputs;
  const reason = everythingReason(changed, graph);
  if (reason !== "") {
    return { all: true, reason };
  }
  const covered = reachedByCoverage(changed, inputs, recording);
  if (!covered.ok) {
    return { all: true, reason: covered.reason };
  }
  const run = tests.filter((test) => {
    const reached = reachedFrom(graph, [test]);
    return covered.value.has(test) || changed.some((file) => reached.has(file));
  });
  return { all: false, run, skipped: tests.filter((test) => !run.includes(test)) };
}

function noneOf(cwd: string): BrowserTests {
  const tests = browserTestFiles(cwd);
  if (!tests.ok) {
    return { all: true, reason: tests.reason };
  }
  return { all: false, run: [], skipped: tests.value };
}

function browserTestsFor({ changed, cwd, ...recording }: Selecting): BrowserTests {
  if (!changed.ok) {
    return { all: true, reason: changed.reason };
  }
  if (changed.value.every((file) => isDocs(file))) {
    return noneOf(cwd);
  }
  const inputs = inputsIn(cwd);
  if (!inputs.ok) {
    return { all: true, reason: inputs.reason };
  }
  return selected(changed.value, inputs.value, recording);
}

function browserSkip(tests: BrowserTests): readonly CiOnly[] {
  if (tests.all || tests.skipped.length === NONE) {
    return [];
  }
  const names = tests.skipped.map((test) => path.basename(test, TEST_SUFFIX)).join(", ");
  const total = tests.run.length + tests.skipped.length;
  return [
    {
      ciJob: "browser",
      command: "pnpm browser",
      name: `the browser tests this branch doesn't reach (${String(tests.skipped.length)} of ${String(total)} files: ${names})`,
      workflow: "Release",
    },
  ];
}

interface CiShard {
  readonly cwd: string;
  readonly gh: (args: readonly string[]) => Outcome<string>;
  readonly run: string;
  readonly shard: string;
}

function ciBrowserShard({ cwd, gh, run, shard }: CiShard): Plan {
  return browserShardPlan({ files: browserTestFiles(cwd), gh, run, shard });
}

export type { BrowserTests };
export { browserSkip, browserTestFiles, browserTestsFor, ciBrowserShard };

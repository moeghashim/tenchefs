import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { DateTime } from "effect";
import { GH_2_102_JSON_FIELDS } from "./gh-json-fields.ts";
import type { Step } from "../../lib/merge-steps.ts";
import { ciGreen } from "../../lib/ci-gate.ts";
import { onTestFinished } from "vitest";
import path from "node:path";
import { tmpdir } from "node:os";

const URL = "https://github.com/o/r/actions/runs/42";
const RUN = [{ databaseId: 42 }];
const POLLS = 2;
const NO_WAITS = 0;
const ONE_WAIT = 1;
const COMPLETED = "completed";
const RUNNING = "in_progress";
const EXECUTABLE = 0o755;

const FAKE_GH = `
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const dir = new URL(".", import.meta.url);
const state = JSON.parse(readFileSync(new URL("state.json", dir), "utf8"));
const args = process.argv.slice(2);
const known = ${JSON.stringify(GH_2_102_JSON_FIELDS)}[args[0]];
const fields = args.includes("--json") ? (args[args.indexOf("--json") + 1] ?? "").split(",") : [];
const unknown = known === undefined ? undefined : fields.find((name) => !known.includes(name));
if (unknown !== undefined) {
  process.stderr.write(\`Unknown JSON field: "\${unknown}"\`);
  process.exit(1);
}
const named = \`\${args[0]} \${args[1]}\`;
const verb = args.includes("--log-failed") ? "log" : named in state ? named : args[1];
appendFileSync(new URL("calls.log", dir), process.argv.slice(2).join(" ") + "\\n");
const queue = state[verb] ?? [];
const next = queue.length > 1 ? queue.shift() : queue[0];
writeFileSync(new URL("state.json", dir), JSON.stringify(state));
if (next === "fail") {
  process.stderr.write("HTTP 502");
  process.exit(1);
}
process.stdout.write(typeof next === "string" || next === undefined ? (next ?? "") : JSON.stringify(next));
`;

interface Ended {
  readonly conclusion: string;
  readonly failedStep: string;
  readonly name: string;
}

interface View {
  readonly headSha?: string;
  readonly jobs: readonly Job[];
  readonly status: string;
  readonly url?: string;
}

interface Job {
  readonly completedAt?: string;
  readonly conclusion: string;
  readonly name: string;
  readonly startedAt?: string;
  readonly status: string;
  readonly steps: readonly { readonly conclusion: string; readonly name: string }[];
}

interface Gated {
  readonly logs: readonly string[];
  readonly sleeps: number;
  readonly step: Step;
}

interface Fake {
  readonly calls: () => readonly string[];
  readonly gate: (args: readonly string[], appear?: number) => Gated;
}

interface Responses {
  readonly [command: `${string} ${string}`]: readonly unknown[];
  readonly list: readonly unknown[];
  readonly log?: readonly string[];
  readonly rerun?: readonly string[];
  readonly view: readonly unknown[];
}

const JOB_ID = 7;
const E2E_STEPS = "\ne2e-docker failed steps: pnpm check";

function ended({ conclusion, failedStep, name }: Ended): Job {
  const steps = [
    { conclusion: "success", name: "Set up job" },
    { conclusion, name: failedStep },
  ];
  return { conclusion, name, status: COMPLETED, steps };
}

function done(name: string): Job {
  return ended({ conclusion: "success", failedStep: "pnpm check", name });
}

function running(name: string): Job {
  return { conclusion: "", name, status: RUNNING, steps: [] };
}

const STARTED_AT = "2026-11-24T10:00:00Z";
const MS_PER_MINUTE = 60_000;

function ranFor({ job, minutes }: { readonly job: Job; readonly minutes: number }): Job {
  const started = DateTime.toEpochMillis(DateTime.makeUnsafe(STARTED_AT));
  const completedAt = DateTime.formatIso(DateTime.makeUnsafe(started + minutes * MS_PER_MINUTE));
  return { ...job, completedAt, startedAt: STARTED_AT };
}

function view({ headSha, jobs, status, url = URL }: View): unknown {
  return { headSha, jobs: jobs.map((job) => ({ ...job, databaseId: JOB_ID })), status, url };
}

function stateDir(responses: Responses, workflow = ""): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ci-gate-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  writeFileSync(path.join(dir, "gh.mjs"), FAKE_GH);
  writeFileSync(path.join(dir, "state.json"), JSON.stringify(responses));
  writeFileSync(path.join(dir, "calls.log"), "");
  if (workflow !== "") {
    mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(path.join(dir, ".github", "workflows", "check.yml"), workflow);
  }
  return dir;
}

interface FakeOptions extends Responses {
  readonly event?: string;
  readonly workflow?: string;
}

function fake({ event = "push", workflow = "", ...responses }: FakeOptions): Fake {
  const dir = stateDir(responses, workflow);
  return {
    calls: (): readonly string[] => readFileSync(path.join(dir, "calls.log"), "utf8").trim().split("\n"),
    gate: (args, appear = NO_WAITS): Gated => {
      const logs: string[] = [];
      const sleeps: string[] = [];
      const step = ciGreen({
        appear,
        args,
        cwd: dir,
        event,
        gh: ["node", path.join(dir, "gh.mjs")],
        log: (line) => {
          logs.push(line);
        },
        polls: POLLS,
        sleep: () => {
          sleeps.push("slept");
        },
        subject: "v1",
      });
      return { logs, sleeps: sleeps.length, step };
    },
  };
}

const NO_SLEEP = "Atomics.wait = () => 'timed-out';\n";

function ghOnPath(responses: Responses): string {
  const dir = stateDir(responses);
  const gh = path.join(dir, "gh");
  writeFileSync(path.join(dir, "no-sleep.mjs"), NO_SLEEP);
  writeFileSync(gh, `#!/bin/sh\nexec node "${path.join(dir, "gh.mjs")}" "$@"\n`);
  chmodSync(gh, EXECUTABLE);
  return dir;
}

function reasonOf(step: Step): string {
  if (step.kind === "stopped") {
    return step.reason;
  }
  return "green";
}

export type { Responses };
export {
  COMPLETED,
  E2E_STEPS,
  NO_WAITS,
  ONE_WAIT,
  POLLS,
  RUN,
  RUNNING,
  URL,
  done,
  ended,
  fake,
  ghOnPath,
  ranFor,
  reasonOf,
  running,
  view,
};

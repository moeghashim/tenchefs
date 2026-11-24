import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const verb = args.includes("--log-failed") ? "log" : args[1];
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
  readonly jobs: readonly Job[];
  readonly status: string;
  readonly url?: string;
}

interface Job {
  readonly conclusion: string;
  readonly name: string;
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
  readonly gate: (args: readonly string[], base?: readonly string[], appear?: number) => Gated;
}

interface Responses {
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

function view({ jobs, status, url = URL }: View): unknown {
  return { jobs: jobs.map((job) => ({ ...job, databaseId: JOB_ID })), status, url };
}

function stateDir(responses: Responses): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ci-gate-"));
  onTestFinished(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  writeFileSync(path.join(dir, "gh.mjs"), FAKE_GH);
  writeFileSync(path.join(dir, "state.json"), JSON.stringify(responses));
  writeFileSync(path.join(dir, "calls.log"), "");
  return dir;
}

interface FakeOptions extends Responses {
  readonly rerunRed?: boolean;
  readonly vouchedBy?: string;
}

function fake({ rerunRed = false, vouchedBy = "", ...responses }: FakeOptions): Fake {
  const dir = stateDir(responses);
  return {
    calls: (): readonly string[] => readFileSync(path.join(dir, "calls.log"), "utf8").trim().split("\n"),
    gate: (args, base = [], appear = NO_WAITS): Gated => {
      const logs: string[] = [];
      const sleeps: string[] = [];
      const step = ciGreen({
        appear,
        args,
        base,
        cwd: dir,
        gh: ["node", path.join(dir, "gh.mjs")],
        log: (line) => {
          logs.push(line);
        },
        polls: POLLS,
        rerunRed,
        sleep: () => {
          sleeps.push("slept");
        },
        subject: "v1",
        vouchedBy,
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
  reasonOf,
  running,
  view,
};

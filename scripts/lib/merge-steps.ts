import { spawnSync } from "node:child_process";

type Command = readonly string[];

interface Stopped {
  readonly cutOff?: true;
  readonly files: readonly string[];
  readonly jobs: readonly string[];
  readonly kind: "stopped";
  readonly reason: string;
}

type Step = { readonly kind: "done" } | Stopped;
interface Ran {
  readonly ok: boolean;
  readonly output: string;
}

const NONE = 0;
const EXIT_SUCCESS = 0;
const MAX_BUFFER = 268_435_456;
const OUTPUT_TAIL = -40;
const DONE: Step = { kind: "done" };
const RERERE = ["-c", "rerere.enabled=true", "-c", "rerere.autoUpdate=true"] as const;

function stop(reason: string, ...files: readonly string[]): Stopped {
  return { files, jobs: [], kind: "stopped", reason };
}

function run(cwd: string, ...command: Command): Ran {
  const [program = "true", ...args] = command;
  const ran = spawnSync(program, args, { cwd, encoding: "utf8", maxBuffer: MAX_BUFFER });
  if (ran.error instanceof Error) {
    return { ok: false, output: ran.error.message };
  }
  return { ok: ran.status === EXIT_SUCCESS, output: `${ran.stdout}${ran.stderr}`.trim() };
}

function git(options: { readonly cwd: string }, ...args: readonly string[]): Ran {
  return run(options.cwd, "git", ...args);
}

function tail(output: string): string {
  return output.split("\n").slice(OUTPUT_TAIL).join("\n");
}

function lines(output: string): readonly string[] {
  return output.split("\n").filter((line) => line.length > NONE);
}

function stepOf({ ran, what }: { readonly ran: Ran; readonly what: string }): Step {
  if (ran.ok) {
    return DONE;
  }
  return stop(`${what} failed; nothing was pushed.\n${tail(ran.output)}`);
}

function firstStop(steps: readonly (() => Step)[]): Step {
  for (const step of steps) {
    const result = step();
    if (result.kind === "stopped") {
      return result;
    }
  }
  return DONE;
}

export type { Command, Ran, Step, Stopped };
export { DONE, RERERE, firstStop, git, lines, run, stepOf, stop, tail };

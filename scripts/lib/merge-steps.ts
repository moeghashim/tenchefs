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

const EXIT_SUCCESS = 0;
const MAX_BUFFER = 268_435_456;
const OUTPUT_TAIL = -40;
const DONE: Step = { kind: "done" };

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

function tail(output: string): string {
  return output.split("\n").slice(OUTPUT_TAIL).join("\n");
}

export type { Command, Step, Stopped };
export { DONE, run, stop, tail };

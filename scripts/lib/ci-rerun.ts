import type { Command, Step, Stopped } from "./merge-steps.ts";
import { run, tail } from "./merge-steps.ts";

interface Refused extends Stopped {
  readonly runNumber: number;
}

interface RerunOptions {
  readonly again: (runNumber: number) => Step;
  readonly cwd: string;
  readonly first: Step;
  readonly gh: Command;
  readonly log: (line: string) => void;
  readonly rerunRed?: boolean;
  readonly sleep: () => void;
  readonly subject: string;
}

function isRefused(step: Step): step is Refused {
  return step.kind === "stopped" && "runNumber" in step;
}

function redAgain(step: Step): Step {
  if (!isRefused(step)) {
    return step;
  }
  return { ...step, reason: `${step.reason}\nIts failed jobs were rerun once and failed again.` };
}

function rerunFailed(options: RerunOptions, refused: Refused): Step {
  const args = ["run", "rerun", String(refused.runNumber), "--failed"];
  const ran = run(options.cwd, ...options.gh, ...args);
  if (!ran.ok) {
    const reason = `${refused.reason}\nCould not rerun its failed jobs: gh ${args.join(" ")}\n${tail(ran.output)}`;
    return { ...refused, reason };
  }
  options.log(
    `${options.subject}'s Check run ${refused.runNumber} is red: rerunning its failed jobs once, in case they were flaky: ${refused.jobs.join(", ")}.`,
  );
  options.sleep();
  return redAgain(options.again(refused.runNumber));
}

function retriedOnce(options: RerunOptions): Step {
  const { first } = options;
  if (options.rerunRed !== true || !isRefused(first)) {
    return first;
  }
  return rerunFailed(options, first);
}

export type { Refused };
export { retriedOnce };

import type { Step } from "./merge-steps.ts";
import { ciGreen } from "./ci-gate.ts";

interface Wait {
  readonly args: readonly string[];
  readonly log: (line: string) => void;
  readonly subject: string;
}

const WAIT_MS = 30_000;
const APPEAR_WAITS = 20;
const RUN_WAITS = 40;
const SLEEP_SLOT = 0;

function sleep(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), SLEEP_SLOT, SLEEP_SLOT, WAIT_MS);
}

function waitForCi({ args, log, subject }: Wait): Step {
  return ciGreen({
    appear: APPEAR_WAITS,
    args,
    cwd: process.cwd(),
    event: "push",
    gh: ["gh"],
    log,
    polls: RUN_WAITS,
    sleep,
    subject,
  });
}

export { waitForCi };

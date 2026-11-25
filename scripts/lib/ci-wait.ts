import type { Step } from "./merge-steps.ts";
import { ciGreen } from "./ci-gate.ts";

interface Wait {
  readonly args: readonly string[];
  readonly base: readonly string[];
  readonly log: (line: string) => void;
  readonly rerunRed?: boolean;
  readonly subject: string;
  readonly vouchedBy?: string;
}

const WAIT_MS = 30_000;
const APPEAR_WAITS = 20;
const RUN_WAITS = 40;
const SLEEP_SLOT = 0;

function sleep(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)), SLEEP_SLOT, SLEEP_SLOT, WAIT_MS);
}

function waitForCi({ args, base, log, rerunRed = false, subject, vouchedBy = "" }: Wait): Step {
  return ciGreen({
    appear: APPEAR_WAITS,
    args,
    base,
    cwd: process.cwd(),
    event: "push",
    gh: ["gh"],
    log,
    polls: RUN_WAITS,
    rerunRed,
    sleep,
    subject,
    vouchedBy,
  });
}

export { waitForCi };

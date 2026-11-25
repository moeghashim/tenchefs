interface Verdict {
  readonly failingAt: (step: string) => void;
  readonly succeedWith: (line: string) => void;
}

const PASSED = "RESULT: PASS";
const EXIT_CUT_OFF = 3;
const EXIT_SUCCESS = 0;
const NONE = 0;

function verdictLine(failed: readonly string[]): string {
  if (failed.length === NONE) {
    return PASSED;
  }
  return `RESULT: FAIL (${failed.join(", ")})`;
}

function mergedLine(sha: string): string {
  return `RESULT: MERGED ${sha}`;
}

function failedJobsOr({ jobs, step }: { readonly jobs: readonly string[]; readonly step: string }): string {
  if (jobs.length === NONE) {
    return step;
  }
  return jobs.join(", ");
}

function cutOffLine(jobs: readonly string[]): string {
  return `${jobs.join(", ")} cut off at its time limit`;
}

function verdictOnExit(firstStep: string): Verdict {
  const state = { step: firstStep, success: PASSED };
  process.once("exit", (code) => {
    if (code === EXIT_SUCCESS) {
      console.log(state.success);
      return;
    }
    console.log(verdictLine([state.step]));
  });
  return {
    failingAt: (step) => {
      state.step = step;
    },
    succeedWith: (line) => {
      state.success = line;
    },
  };
}

export { EXIT_CUT_OFF, cutOffLine, failedJobsOr, mergedLine, verdictLine, verdictOnExit };

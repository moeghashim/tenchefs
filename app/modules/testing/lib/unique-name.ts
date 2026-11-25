import type { TestInfo } from "@playwright/test";

type TestRun = Pick<TestInfo, "retry" | "testId">;

interface Naming {
  readonly name: string;
  readonly run: TestRun;
}

const RUN_ID_LENGTH = 8;

function uniqueName({ name, run }: Naming): string {
  const runId = run.testId.slice(-RUN_ID_LENGTH).toLowerCase();
  return `${name}-${runId}${String(run.retry)}`;
}

export { type TestRun, uniqueName };

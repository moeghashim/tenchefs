import type { TriggerFailure } from "../../sdk/index.ts";

interface Shown {
  readonly answer: Pick<TriggerFailure, "error" | "status">;
  readonly silent: string;
}

function answerTextOf({ answer: { error, status }, silent }: Shown): string {
  if (typeof status !== "number") {
    return error ?? silent;
  }
  const code = `HTTP ${String(status)}`;
  if (typeof error === "string") {
    return `${code}: ${error}`;
  }
  return code;
}

export { answerTextOf };

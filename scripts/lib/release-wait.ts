import type { Outcome } from "./tools.ts";

interface Deferrable {
  readonly retryAtMillis?: number;
}

interface Waiting<Decision extends Deferrable> {
  readonly decide: () => Outcome<Decision>;
  readonly nowMillis: () => number;
  readonly sleep: (millis: number) => Promise<void>;
}

const WAITS = 3;
const NONE = 0;
const ONE = 1;

async function waitedFor<Decision extends Deferrable>(
  waiting: Waiting<Decision>,
  decision: Outcome<Decision>,
  waitsLeft: number,
): Promise<Outcome<Decision>> {
  if (!decision.ok || waitsLeft === NONE) {
    return decision;
  }
  const { retryAtMillis } = decision.value;
  if (typeof retryAtMillis !== "number") {
    return decision;
  }
  await waiting.sleep(Math.max(NONE, retryAtMillis - waiting.nowMillis()));
  return waitedFor(waiting, waiting.decide(), waitsLeft - ONE);
}

async function decideAfterWaiting<Decision extends Deferrable>(waiting: Waiting<Decision>): Promise<Outcome<Decision>> {
  const decided = await waitedFor(waiting, waiting.decide(), WAITS);
  return decided;
}

export { decideAfterWaiting };

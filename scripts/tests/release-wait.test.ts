import { expect, it } from "vitest";
import type { Outcome } from "../lib/tools.ts";
import { decideAfterWaiting } from "../lib/release-wait.ts";

interface Decision {
  readonly go: boolean;
  readonly line: string;
  readonly retryAtMillis?: number;
}

interface Clock {
  millis: number;
  readonly slept: number[];
}

interface Waited {
  readonly clock: Clock;
  readonly result: Promise<Outcome<Decision>>;
}

const NOW_MS = 1_800_000_000_000;
const MINUTE_MS = 60_000;
const A_MINUTE = 1;
const TWENTY_MINUTES = 20;
const NO_SLEEP = 0;
const MOST_WAITS = 3;
const LAST = 1;
const GOES: Outcome<Decision> = { ok: true, value: { go: true, line: "runs" } };
const FAILED: Outcome<Decision> = { ok: false, reason: "gh run list failed" };

function waitsUntil(minutesFromNow: number): Outcome<Decision> {
  return { ok: true, value: { go: false, line: "waits", retryAtMillis: NOW_MS + minutesFromNow * MINUTE_MS } };
}

function waitingOn(decisions: readonly Outcome<Decision>[]): Waited {
  const clock: Clock = { millis: NOW_MS, slept: [] };
  const queue = [...decisions];
  const result = decideAfterWaiting({
    decide: () => {
      const [next = FAILED] = queue;
      if (queue.length > LAST) {
        queue.shift();
      }
      return next;
    },
    nowMillis: () => clock.millis,
    sleep: async (millis) => {
      clock.slept.push(millis);
      clock.millis += millis;
      await Promise.resolve();
    },
  });
  return { clock, result };
}

it("decides once, without waiting, when nothing asks it to wait", { timeout: 1000 }, async () => {
  expect.hasAssertions();

  const { clock, result } = waitingOn([GOES]);

  await expect(result).resolves.toStrictEqual(GOES);
  expect(clock.slept).toStrictEqual([]);
});

it("sleeps until the gate run is 30 minutes old, then decides again and goes", { timeout: 1000 }, async () => {
  expect.hasAssertions();

  const { clock, result } = waitingOn([waitsUntil(TWENTY_MINUTES), GOES]);

  await expect(result).resolves.toStrictEqual(GOES);
  expect(clock.slept).toStrictEqual([TWENTY_MINUTES * MINUTE_MS]);
});

it("decides again at once when the time to wait for has already passed", { timeout: 1000 }, async () => {
  expect.hasAssertions();

  const { clock, result } = waitingOn([waitsUntil(-A_MINUTE), GOES]);

  await expect(result).resolves.toStrictEqual(GOES);
  expect(clock.slept).toStrictEqual([NO_SLEEP]);
});

it("gives up after 3 waits, ending with the last decision not to go", { timeout: 1000 }, async () => {
  expect.hasAssertions();

  const { clock, result } = waitingOn([waitsUntil(A_MINUTE)]);

  await expect(result).resolves.toMatchObject({ ok: true, value: { go: false, line: "waits" } });
  expect(clock.slept).toHaveLength(MOST_WAITS);
});

it("stops waiting when a decision fails", { timeout: 1000 }, async () => {
  expect.hasAssertions();

  const { result } = waitingOn([waitsUntil(A_MINUTE), FAILED]);

  await expect(result).resolves.toStrictEqual(FAILED);
});

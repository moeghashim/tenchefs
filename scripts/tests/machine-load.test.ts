import { expect, it } from "vitest";
import { loadReport, osReading, quietMachine } from "../lib/machine-load.ts";

const CORES = 10;
const BUSY = 14.5;
const QUIET = 3.25;
const NONE = 0;
const LIMIT = 20;
const HIGH = 27.5;
const FALLING = 22;
const DROPPED = 18;
const TWICE = 2;
const ONE_MORE = 1;

it("prints the load average and core count, with no warning when the load is within the cores", {
  timeout: 5000,
}, () => {
  expect.hasAssertions();

  expect(loadReport(() => ({ cores: CORES, load: QUIET }))).toStrictEqual({
    line: "check: load average 3.25 over the last minute, on 10 cores.",
    warning: "",
  });
});

it("warns when the load average is above the core count", { timeout: 5000 }, () => {
  expect.hasAssertions();

  expect(loadReport(() => ({ cores: CORES, load: BUSY })).warning).toBe(
    "check: WARNING: the load average (14.50) is above the core count (10), so browser tests may time out at random. A timeout in a file you didn't touch is likely load, not your change.",
  );
});

it("reads the machine's own load and core count", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const { cores, load } = osReading();

  expect([cores > NONE, load >= NONE]).toStrictEqual([true, true]);
});

interface Waiting {
  readonly said: string[];
  readonly sleeps: number;
}

async function waitedThrough(loads: readonly number[]): Promise<Waiting> {
  const said: string[] = [];
  const queue = [...loads];
  let sleeps = NONE;
  await quietMachine({
    limit: LIMIT,
    read: () => ({ cores: CORES, load: queue.shift() ?? NONE }),
    say: (line) => {
      said.push(line);
    },
    sleep: async () => {
      sleeps += ONE_MORE;
      await Promise.resolve();
    },
  });
  return { said, sleeps };
}

it("waits while the load average is above the limit, saying once that it waits", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await expect(waitedThrough([HIGH, FALLING, DROPPED])).resolves.toStrictEqual({
    said: ["load average 27.50 is above 20: waiting for it to drop before the tests start."],
    sleeps: TWICE,
  });
  await expect(waitedThrough([QUIET])).resolves.toStrictEqual({ said: [], sleeps: NONE });
});

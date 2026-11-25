import { availableParallelism, loadavg } from "node:os";

interface Reading {
  readonly cores: number;
  readonly load: number;
}

interface Recheck {
  readonly limit: number;
  readonly read: () => Reading;
  readonly sleep: () => Promise<void>;
}

interface QuietWait extends Recheck {
  readonly say: (line: string) => void;
}

interface LoadReport {
  readonly line: string;
  readonly warning: string;
}

const LAST_MINUTE = 0;
const DECIMALS = 2;

function osReading(): Reading {
  const [load = LAST_MINUTE] = loadavg();
  return { cores: availableParallelism(), load };
}

function loadReport(read: () => Reading): LoadReport {
  const { cores, load } = read();
  const shown = load.toFixed(DECIMALS);
  const line = `check: load average ${shown} over the last minute, on ${cores} cores.`;
  if (load <= cores) {
    return { line, warning: "" };
  }
  return {
    line,
    warning: `check: WARNING: the load average (${shown}) is above the core count (${cores}), so browser tests may time out at random. A timeout in a file you didn't touch is likely load, not your change.`,
  };
}

async function loadDropped(recheck: Recheck): Promise<void> {
  await recheck.sleep();
  if (recheck.read().load > recheck.limit) {
    await loadDropped(recheck);
  }
}

async function quietMachine(wait: QuietWait): Promise<void> {
  const { load } = wait.read();
  if (load <= wait.limit) {
    return;
  }
  const shown = load.toFixed(DECIMALS);
  wait.say(`load average ${shown} is above ${String(wait.limit)}: waiting for it to drop before the tests start.`);
  await loadDropped(wait);
}

export { loadReport, osReading, quietMachine };

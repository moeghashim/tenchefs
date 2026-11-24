import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { expect, it, onTestFinished } from "vitest";
import { holdMachineLock, waitingLine } from "../lib/machine-lock.ts";
import type { Holder } from "../lib/machine-lock.ts";
import { once } from "node:events";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const POLL_MS = 10;
const LATER_MS = 50;
const NO_SUCH_PID = 2_147_483_646;
const FIRST_WORKTREE = "/worktrees/first";
const SECOND_WORKTREE = "/worktrees/second";
const MACHINE_LOCK = new URL("../lib/machine-lock.ts", import.meta.url).pathname;

function lockFile(): string {
  const folder = mkdtempSync(path.join(tmpdir(), "machine-lock-"));
  onTestFinished(() => {
    rmSync(folder, { force: true, recursive: true });
  });
  return path.join(folder, "check.lock");
}

interface Recorder {
  readonly note: (line: string) => void;
  readonly order: readonly string[];
}

function recorder(): Recorder {
  const order: string[] = [];
  return {
    note: (line): void => {
      order.push(line);
    },
    order,
  };
}

async function hold(file: string, worktree: string, note: (line: string) => void): Promise<() => void> {
  const release = await holdMachineLock({
    file,
    onWait: (holder) => {
      note(waitingLine({ holder, script: "check" }));
    },
    pollMs: POLL_MS,
    worktree,
  });
  return release;
}

async function holdThenRelease(file: string, note: (line: string) => void): Promise<void> {
  const release = await hold(file, SECOND_WORKTREE, note);
  note("second holds it");
  release();
}

async function heldByChild(file: string): Promise<() => Promise<void>> {
  const script = `import { holdMachineLock } from ${JSON.stringify(MACHINE_LOCK)};
await holdMachineLock({ file: ${JSON.stringify(file)}, onWait: () => {}, pollMs: 10, worktree: ${JSON.stringify(FIRST_WORKTREE)} });
console.log("held");
setInterval(() => {}, 1000);`;
  const child = spawn("node", ["--input-type=module", "--eval", script], { stdio: ["ignore", "pipe", "inherit"] });
  await once(child.stdout, "data");
  return async (): Promise<void> => {
    child.kill("SIGKILL");
    await once(child, "exit");
  };
}

it("a second holder waits, naming the first's worktree, until the first releases the lock", {
  timeout: 2000,
}, async () => {
  expect.hasAssertions();

  const file = lockFile();
  const { note, order } = recorder();
  const release = await hold(file, FIRST_WORKTREE, note);
  const waiting = holdThenRelease(file, note);
  await sleep(LATER_MS);
  note("first releases it");
  release();
  await waiting;

  expect([order, existsSync(file)]).toStrictEqual([
    [
      waitingLine({ holder: { pid: process.pid, worktree: FIRST_WORKTREE }, script: "check" }),
      "first releases it",
      "second holds it",
    ],
    false,
  ]);
});

it("the waiting line names the holder's worktree and pid", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(waitingLine({ holder: { pid: 42, worktree: FIRST_WORKTREE }, script: "coverage:changed" })).toBe(
    `coverage:changed: waiting for the test suite already running on this machine in ${FIRST_WORKTREE} (pid 42). Two at once overload the CPU until spawned test processes time out (#94, #408).`,
  );
});

it("a holder that is killed frees the lock", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const file = lockFile();
  const kill = await heldByChild(file);
  const waitedOn: Holder[] = [];
  const holding = holdMachineLock({
    file,
    onWait: (holder) => {
      waitedOn.push(holder);
    },
    pollMs: POLL_MS,
    worktree: SECOND_WORKTREE,
  });
  await sleep(LATER_MS);
  await kill();
  const release = await holding;
  release();

  expect([waitedOn.map((holder) => holder.worktree), existsSync(file)]).toStrictEqual([[FIRST_WORKTREE], false]);
});

it("takes over a lock whose holder has exited, even one written before the lock named worktrees", {
  timeout: 2000,
}, async () => {
  expect.hasAssertions();

  const file = lockFile();
  writeFileSync(file, String(NO_SUCH_PID));
  const waitedOn: Holder[] = [];

  const release = await holdMachineLock({
    file,
    onWait: (holder) => {
      waitedOn.push(holder);
    },
    pollMs: POLL_MS,
    worktree: SECOND_WORKTREE,
  });
  release();

  expect([waitedOn, existsSync(file)]).toStrictEqual([[], false]);
});

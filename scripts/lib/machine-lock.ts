import { readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

interface Holder {
  readonly pid: number;
  readonly worktree: string;
}

interface MachineLock {
  readonly file: string;
  readonly onWait: (holder: Holder) => void;
  readonly pollMs: number;
  readonly worktree: string;
}

type Claim = { readonly held: true } | { readonly held: false; readonly holder: Holder };

const NO_HOLDER = 0;
const SUITE_LOCK_FILE = path.join(os.tmpdir(), "cookout-check.lock");

function codeOf(error: unknown): unknown {
  if (error instanceof Error && "code" in error) {
    return error.code;
  }
  return "";
}

function isAlive(pid: number): boolean {
  if (pid === NO_HOLDER) {
    return false;
  }
  try {
    process.kill(pid, NO_HOLDER);
    return true;
  } catch (error) {
    return codeOf(error) === "EPERM";
  }
}

function holderOf(file: string): Holder {
  try {
    const [pid = "", worktree = ""] = readFileSync(file, "utf8").split("\n");
    return { pid: Math.trunc(Number(pid)) || NO_HOLDER, worktree };
  } catch {
    return { pid: NO_HOLDER, worktree: "" };
  }
}

function claim(lock: MachineLock): Claim {
  try {
    writeFileSync(lock.file, `${String(process.pid)}\n${lock.worktree}`, { flag: "wx" });
    return { held: true };
  } catch (error) {
    if (codeOf(error) !== "EEXIST") {
      throw error;
    }
    const holder = holderOf(lock.file);
    if (isAlive(holder.pid)) {
      return { held: false, holder };
    }
    rmSync(lock.file, { force: true });
    return claim(lock);
  }
}

async function waitFor(lock: MachineLock, warned: boolean): Promise<void> {
  const claimed = claim(lock);
  if (claimed.held) {
    return;
  }
  if (!warned) {
    lock.onWait(claimed.holder);
  }
  await sleep(lock.pollMs);
  await waitFor(lock, true);
}

async function holdMachineLock(lock: MachineLock): Promise<() => void> {
  await waitFor(lock, false);
  return (): void => {
    rmSync(lock.file, { force: true });
  };
}

interface Waiting {
  readonly holder: Holder;
  readonly script: string;
}

function waitingLine({ holder: { pid, worktree }, script }: Waiting): string {
  return `${script}: waiting for the test suite already running on this machine in ${worktree} (pid ${String(pid)}). Two at once overload the CPU until spawned test processes time out (#94, #408).`;
}

export type { Holder };
export { SUITE_LOCK_FILE, holdMachineLock, waitingLine };

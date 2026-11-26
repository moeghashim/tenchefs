import { once } from "node:events";
import { spawn } from "node:child_process";

interface Finished {
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

interface Running {
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly program: string;
}

function statusOf(closed: readonly unknown[]): number | null {
  const [code] = closed;
  if (typeof code === "number") {
    return code;
  }
  return null;
}

async function ranAtOnce({ args, cwd = process.cwd(), program }: Running): Promise<Finished> {
  const child = spawn(program, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on("data", (chunk: unknown) => {
    stdout.push(String(chunk));
  });
  child.stderr.on("data", (chunk: unknown) => {
    stderr.push(String(chunk));
  });
  const closed: readonly unknown[] = await once(child, "close");
  return { status: statusOf(closed), stderr: stderr.join(""), stdout: stdout.join("") };
}

export { type Finished, ranAtOnce };

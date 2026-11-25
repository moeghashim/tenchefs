import { createInterface } from "node:readline";
import { once } from "node:events";
import { spawn } from "node:child_process";

const PRESENCE_GRACE_SECONDS = "2";

interface DevCookout {
  readonly adminToken: string;
  readonly relayUrl: string;
  readonly webUrl: string;
}

function fieldsOf(line: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(line);
    return Object.fromEntries(Object.entries(parsed ?? {}));
  } catch {
    return {};
  }
}

function devCookoutIn(line: string): DevCookout | null {
  const { adminToken, relayUrl, webUrl } = fieldsOf(line);
  const urls = typeof relayUrl === "string" && typeof webUrl === "string";
  if (typeof adminToken === "string" && urls) {
    return { adminToken, relayUrl, webUrl };
  }
  return null;
}

async function startLine(lines: AsyncIterable<string>): Promise<DevCookout> {
  for await (const line of lines) {
    const cookout = devCookoutIn(line);
    if (cookout !== null) {
      return cookout;
    }
  }
  throw new Error("app/dev.ts start stopped before printing its start line");
}

function probeArguments(): string[] {
  if (process.env["COOKOUT_BROWSER_PROBE"] === "1") {
    return ["--probe"];
  }
  return [];
}

async function setup(): Promise<() => Promise<void>> {
  const dev = spawn(process.execPath, ["app/dev.ts", "start", ...probeArguments()], {
    env: { ...process.env, COOKOUT_PRESENCE_GRACE_SECONDS: PRESENCE_GRACE_SECONDS },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const cookout = await startLine(createInterface({ input: dev.stdout }));
  process.env["COOKOUT_TOKEN"] = cookout.adminToken;
  process.env["COOKOUT_URL"] = cookout.webUrl;
  process.env["COOKOUT_ALLOW_HUMAN"] = "1";
  process.env["COOKOUT_RELAY_URL"] = cookout.relayUrl;
  return async () => {
    dev.kill("SIGINT");
    await once(dev, "exit");
  };
}

export default setup;

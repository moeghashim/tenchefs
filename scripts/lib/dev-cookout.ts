import { field, parseJson, text } from "./json.ts";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { spawn } from "node:child_process";

interface StartLine {
  readonly adminToken: string;
  readonly clockUrl: string;
  readonly url: string;
  readonly webUrl: string;
}

interface DevCookout extends StartLine {
  readonly stop: () => Promise<void>;
}

function startLineOf(line: string): StartLine | null {
  const started = parseJson(line);
  const [adminToken, clockUrl, url, webUrl] = ["adminToken", "clockUrl", "url", "webUrl"].map((name) =>
    text(field(started, name)),
  );
  const urls = typeof clockUrl === "string" && typeof url === "string" && typeof webUrl === "string";
  if (typeof adminToken === "string" && urls) {
    return { adminToken, clockUrl, url, webUrl };
  }
  return null;
}

async function startLine(lines: AsyncIterable<string>): Promise<StartLine> {
  for await (const line of lines) {
    const started = startLineOf(line);
    if (started !== null) {
      return started;
    }
  }
  throw new Error("app/dev.ts start stopped before printing its start line");
}

function webArguments(webFolder: string): readonly string[] {
  if (webFolder === "") {
    return [];
  }
  return ["--web", webFolder];
}

interface DevCookoutOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly webFolder?: string;
}

async function startDevCookout({ env = {}, webFolder = "" }: DevCookoutOptions = {}): Promise<DevCookout> {
  const variables = Object.entries(env).map(([name, value]: readonly [string, string]) => `${name}=${value}`);
  const dev = spawn("env", [...variables, process.execPath, "app/dev.ts", "start", ...webArguments(webFolder)], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  async function stop(): Promise<void> {
    if (dev.exitCode === null) {
      dev.kill("SIGINT");
      await once(dev, "exit");
    }
  }
  try {
    const started = await startLine(createInterface({ input: dev.stdout }));
    return { ...started, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

export { type DevCookout, startDevCookout };

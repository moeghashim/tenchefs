import { mkdtempSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { inject } from "vitest";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

interface WebTestCookout {
  readonly adminToken: string;
  readonly url: string;
  readonly receiverUrl: string;
}

interface RunningWebTestCookout {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

interface Started {
  readonly stop: () => Promise<void>;
  readonly value: string;
}

const WEB_TEST_BUILD = "node_modules/.cache/web-test-server";

const adminToken = "web-test-admin-token-0123456789abcdef0123456789";
const secretsKey = "7765622d74657374207365637265747320206b657920666f7220636f6f6b6f75";

const webTestBoardUrl = "https://board.example.com";

function fieldsOf(line: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(line);
    return Object.fromEntries(Object.entries(parsed ?? {}));
  } catch {
    return {};
  }
}

async function printedField(lines: AsyncIterable<string>, field: string): Promise<string> {
  for await (const line of lines) {
    const value = fieldsOf(line)[field];
    if (typeof value === "string") {
      return value;
    }
  }
  throw new Error(`the process stopped before printing its ${field}`);
}

async function startPrinting(args: readonly string[], field: string): Promise<Started> {
  const started = spawn("env", args, { stdio: ["ignore", "pipe", "ignore"] });
  const value = await printedField(createInterface({ input: started.stdout }), field);
  return {
    stop: async () => {
      started.kill("SIGINT");
      await once(started, "exit");
    },
    value,
  };
}

export async function startFakeRoutine(): Promise<Started> {
  const routine = await startPrinting([process.execPath, "app/dev.ts", "fake-routine"], "fireUrl");
  return routine;
}

export async function startWebTestCookout(): Promise<RunningWebTestCookout> {
  const folder = mkdtempSync(path.join(os.tmpdir(), "cookout-web-test-"));
  const server = await startPrinting(
    [
      `COOKOUT_ADMIN_TOKEN=${adminToken}`,
      `COOKOUT_SECRETS_KEY=${secretsKey}`,
      "COOKOUT_PRESENCE_GRACE_SECONDS=0",
      "COOKOUT_ALLOW_LOCAL_TRIGGERS=true",
      `COOKOUT_PUBLIC_URL=${webTestBoardUrl}`,
      process.execPath,
      `${WEB_TEST_BUILD}/main.js`,
      "serve",
      "--port",
      "0",
      "--host",
      "127.0.0.1",
      "--db",
      path.join(folder, "cookout.db"),
    ],
    "listening",
  );
  return {
    stop: async () => {
      await server.stop();
      rmSync(folder, { force: true, recursive: true });
    },
    url: server.value,
  };
}

export function webTestCookout(): WebTestCookout {
  return { adminToken, receiverUrl: inject("webReceiverUrl"), url: globalThis.location.origin };
}

export { WEB_TEST_BUILD };

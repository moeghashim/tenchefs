import { execFileSync, spawn } from "node:child_process";
import type { TestProject } from "vitest/node";
import { setTimeout as sleep } from "node:timers/promises";

const IMAGE = "chrislusf/seaweedfs:4.53";
const S3_PORT = "8333/tcp";
const ACCESS_KEY_ID = "cookout-tests";
const SECRET_ACCESS_KEY = "cookout-tests-secret";
const REGION = "us-east-1";
const READY_ATTEMPTS = 150;
const READY_WAIT_MS = 200;
const WATCH_SECONDS = 2;
const NO_ATTEMPTS_LEFT = 0;
const ONE_ATTEMPT = 1;

interface S3Container {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKey: string;
  readonly secret: string;
  readonly reason: string;
}

declare module "vitest" {
  interface ProvidedContext {
    s3: S3Container;
  }
}

interface Started {
  readonly container: string;
  readonly watcher: number;
}

const started: Started[] = [];

function docker(args: readonly string[]): string {
  return execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function startContainer(): string {
  return docker([
    "run",
    "--detach",
    "--rm",
    "--label",
    "cookout-tests=s3",
    "--publish",
    "127.0.0.1::8333",
    "--tmpfs",
    "/data",
    "--env",
    `AWS_ACCESS_KEY_ID=${ACCESS_KEY_ID}`,
    "--env",
    `AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}`,
    IMAGE,
    "mini",
    "-dir=/data",
  ]);
}

function publishedPort(container: string): string {
  const published = docker(["port", container, S3_PORT]);
  const [line = ""] = published.split("\n");
  const port = line.slice(line.lastIndexOf(":") + ONE_ATTEMPT);
  if (!/^\d+$/u.test(port)) {
    throw new Error(`Docker published no port for the S3 container: ${published}`);
  }
  return port;
}

function isReady(container: string): boolean {
  try {
    docker(["exec", container, "curl", "--silent", "--output", "/dev/null", "http://127.0.0.1:8333/"]);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilReady(container: string, attemptsLeft: number): Promise<void> {
  if (isReady(container)) {
    return;
  }
  if (attemptsLeft === NO_ATTEMPTS_LEFT) {
    throw new Error("The S3 container did not become ready.");
  }
  await sleep(READY_WAIT_MS);
  await waitUntilReady(container, attemptsLeft - ONE_ATTEMPT);
}

function watchdog(container: string): number {
  const watcher = spawn(
    "sh",
    [
      "-c",
      `while kill -0 ${process.pid} 2>/dev/null; do sleep ${WATCH_SECONDS}; done; docker rm --force ${container} >/dev/null 2>&1`,
    ],
    { detached: true, stdio: "ignore" },
  );
  watcher.unref();
  if (typeof watcher.pid !== "number") {
    throw new TypeError("Could not start the watchdog that removes the S3 container.");
  }
  return watcher.pid;
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    return `The S3 asset store tests need Docker to start a throwaway S3-compatible container (${IMAGE}), and it failed: ${error.message}`;
  }
  return `The S3 asset store tests need Docker to start a throwaway S3-compatible container (${IMAGE}), and it failed: ${String(error)}`;
}

async function run(): Promise<string> {
  const container = startContainer();
  started.push({ container, watcher: watchdog(container) });
  const port = publishedPort(container);
  await waitUntilReady(container, READY_ATTEMPTS);
  return `http://127.0.0.1:${port}`;
}

const credentials = { accessKey: ACCESS_KEY_ID, region: REGION, secret: SECRET_ACCESS_KEY };

export async function setup(project: TestProject): Promise<void> {
  try {
    project.provide("s3", { ...credentials, endpoint: await run(), reason: "" });
  } catch (error) {
    project.provide("s3", { ...credentials, endpoint: "", reason: reasonOf(error) });
  }
}

export function teardown(): void {
  for (const { container, watcher } of started.splice(NO_ATTEMPTS_LEFT)) {
    try {
      docker(["rm", "--force", container]);
    } catch {
      process.stderr.write(`Could not remove the S3 container ${container}.\n`);
    }
    process.kill(watcher);
  }
}

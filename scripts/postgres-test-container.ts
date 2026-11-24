import { execFileSync, spawn } from "node:child_process";
import type { TestProject } from "vitest/node";
import { setTimeout as sleep } from "node:timers/promises";

const IMAGE = "postgres:18-alpine";
const PASSWORD = "cookout-tests";
const POSTGRES_PORT = "5432/tcp";
const READY_ATTEMPTS = 150;
const READY_WAIT_MS = 200;
const WATCH_SECONDS = 2;
const NO_ATTEMPTS_LEFT = 0;
const ONE_ATTEMPT = 1;

interface PostgresContainer {
  readonly url: string;
  readonly reason: string;
}

declare module "vitest" {
  interface ProvidedContext {
    postgres: PostgresContainer;
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
    "cookout-tests=postgres",
    "--publish",
    "127.0.0.1::5432",
    "--tmpfs",
    "/var/lib/postgresql",
    "--env",
    `POSTGRES_PASSWORD=${PASSWORD}`,
    IMAGE,
    "-c",
    "fsync=off",
    "-c",
    "synchronous_commit=off",
    "-c",
    "full_page_writes=off",
    "-c",
    "max_connections=1000",
  ]);
}

function publishedPort(container: string): string {
  const published = docker(["port", container, POSTGRES_PORT]);
  const [line = ""] = published.split("\n");
  const port = line.slice(line.lastIndexOf(":") + ONE_ATTEMPT);
  if (!/^\d+$/u.test(port)) {
    throw new Error(`Docker published no port for the Postgres container: ${published}`);
  }
  return port;
}

function isReady(container: string): boolean {
  try {
    docker(["exec", container, "pg_isready", "--host", "127.0.0.1", "--username", "postgres"]);
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
    throw new Error("The Postgres container did not become ready.");
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
    throw new TypeError("Could not start the watchdog that removes the Postgres container.");
  }
  return watcher.pid;
}

function reasonOf(error: unknown): string {
  if (error instanceof Error) {
    return `The Postgres tests need Docker to start a throwaway Postgres container, and it failed: ${error.message}`;
  }
  return `The Postgres tests need Docker to start a throwaway Postgres container, and it failed: ${String(error)}`;
}

async function run(): Promise<string> {
  const container = startContainer();
  started.push({ container, watcher: watchdog(container) });
  const port = publishedPort(container);
  await waitUntilReady(container, READY_ATTEMPTS);
  return `postgres://postgres:${PASSWORD}@127.0.0.1:${port}/postgres`;
}

export async function setup(project: TestProject): Promise<void> {
  try {
    project.provide("postgres", { reason: "", url: await run() });
  } catch (error) {
    project.provide("postgres", { reason: reasonOf(error), url: "" });
  }
}

export function teardown(): void {
  for (const { container, watcher } of started.splice(NO_ATTEMPTS_LEFT)) {
    try {
      docker(["rm", "--force", container]);
    } catch {
      process.stderr.write(`Could not remove the Postgres container ${container}.\n`);
    }
    process.kill(watcher);
  }
}

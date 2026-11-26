import { WEB_TEST_BUILD, startFakeRoutine } from "./web-test-server.ts";
import type { TestProject } from "vitest/node";
import { build } from "tsdown";

declare module "vitest" {
  interface ProvidedContext {
    webReceiverUrl: string;
  }
}

const FIRST = 0;
const running: (() => Promise<void>)[] = [];

async function buildServer(): Promise<void> {
  await build({
    clean: false,
    config: false,
    dts: false,
    entry: { main: "app/main.ts" },
    fixedExtension: false,
    format: "esm",
    logLevel: "warn",
    outDir: WEB_TEST_BUILD,
    platform: "node",
    target: "node22.18",
  });
}

export async function setup(project: TestProject): Promise<void> {
  const [routine] = await Promise.all([startFakeRoutine(), buildServer()]);
  running.push(routine.stop);
  project.provide("webReceiverUrl", routine.value);
  project.onTestsRerun(buildServer);
}

export async function teardown(): Promise<void> {
  await Promise.all(
    running.splice(FIRST).map(async (stop) => {
      await stop();
    }),
  );
}

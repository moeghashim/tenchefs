#!/usr/bin/env node
/**
 * The `cookout` program: the one place effects run in production. It provides
 * the live Layers and runs the command line. `serve` serves the web UI that
 * `pnpm build` puts in `web/` next to the built file (`dist/web/`).
 */
import { Effect, Exit, Layer, Runtime } from "effect";
import { exitCodeAfterFailure, runCookout } from "./modules/cli/server.ts";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";
import { runMain } from "@effect/platform-node/NodeRuntime";
import { secretsLive } from "./modules/secrets/server.ts";
import { storageLayer } from "./modules/storage/server.ts";

const webFolder = `${import.meta.dirname}/web`;
const args = process.argv.slice(2);

const exitWithCode: Runtime.Teardown = (exit, onExit) => {
  if (Exit.isSuccess(exit)) {
    Runtime.defaultTeardown(exit, onExit);
  } else {
    onExit(exitCodeAfterFailure({ args, cause: exit.cause }));
  }
};

runCookout(args, { storage: storageLayer, webFolder }).pipe(
  Effect.provide(Layer.merge(nodeServices, secretsLive)),
  runMain({ disableErrorReporting: true, teardown: exitWithCode }),
);

/**
 * The dev program behind `pnpm dev` and `pnpm seed`: the cookout on a
 * temporary SQLite file with a webhook fake, for verifying a change locally
 * (ADR 0079). It is never built or published.
 */
import { Cause, Effect, Exit, Runtime } from "effect";
import { devCommandLine } from "./modules/dev/server.ts";
import { layer as nodeServices } from "@effect/platform-node/NodeServices";
import { runMain } from "@effect/platform-node/NodeRuntime";

const ARGUMENTS_FROM = 2;
const EXIT_SUCCESS = 0;

function stopIsSuccess(exit: Exit.Exit<unknown, unknown>, onExit: (code: number) => void): void {
  if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
    onExit(EXIT_SUCCESS);
    return;
  }
  Runtime.defaultTeardown(exit, onExit);
}

runMain(devCommandLine(process.argv.slice(ARGUMENTS_FROM)).pipe(Effect.provide(nodeServices)), {
  disableErrorReporting: true,
  teardown: stopIsSuccess,
});

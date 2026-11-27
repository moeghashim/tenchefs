import { Effect, FileSystem } from "effect";
import { expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { interruptedDev } from "../../server.ts";

const EXIT_SUCCESS = 0;

it.live("pnpm dev exits 0 on Ctrl-C and deletes its database", () =>
  Effect.gen(function* devStopsOnInterrupt() {
    const fs = yield* FileSystem.FileSystem;
    const { database, exitCode } = yield* interruptedDev;
    const kept = yield* Effect.orDie(fs.exists(database));

    expect(database).toContain("cookout-dev-");
    expect(exitCode).toBe(EXIT_SUCCESS);
    expect(kept).toBe(false);
  }).pipe(Effect.provide([NodeServices.layer])),
);

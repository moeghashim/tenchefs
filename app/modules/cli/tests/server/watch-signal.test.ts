import type { CuttableLink, StoppedWatch } from "../../../testing/server.ts";
import { Duration, Effect } from "effect";
import {
  TestCookout,
  commandLineServices,
  cuttableLink,
  signalWatchBinary,
  testCookout,
} from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { Scope } from "effect";
import { TestClock } from "effect/testing";

interface Stuck {
  readonly how: string;
  readonly stop: (link: CuttableLink) => Effect.Effect<void>;
}

const EXIT_SUCCESS = 0;
const PROMPT_STOP_SECONDS = 3;
const A_PROMPT_STOP = Duration.seconds(PROMPT_STOP_SECONDS);
const PAST_THE_FIRST_RETRY = "1500 millis";

function whileReconnecting(link: CuttableLink): Effect.Effect<void> {
  return Effect.andThen(Effect.andThen(link.freeze, link.cut), TestClock.withLive(Effect.sleep(PAST_THE_FIRST_RETRY)));
}

const stuckWatches: readonly Stuck[] = [
  { how: "still connected", stop: (link) => link.freeze },
  { how: "reconnecting", stop: whileReconnecting },
];

function signalledWatch(stop: Stuck["stop"]): Effect.Effect<StoppedWatch, never, Scope.Scope> {
  return Effect.gen(function* signalAStuckWatch() {
    const cookout = yield* TestCookout;
    const link = yield* cuttableLink(cookout.url);
    const bob = yield* cookout.createIdentity("bob");
    return yield* signalWatchBinary({
      args: ["watch"],
      beforeTheSignal: Effect.andThen(link.relayed("event: connected"), stop(link)),
      env: { COOKOUT_TOKEN: bob.token, COOKOUT_URL: link.url },
    });
  }).pipe(Effect.provide([testCookout(), commandLineServices]));
}

it.effect.each(stuckWatches)(
  "SIGTERM on a cookout watch whose server has stopped answering, $how, exits 0 within 3 s",
  ({ stop }) =>
    Effect.gen(function* stuckWatchStops() {
      const stopped = yield* signalledWatch(stop);

      expect(stopped.exitCode).toBe(EXIT_SUCCESS);
      expect(Duration.isLessThan(stopped.stoppedIn, A_PROMPT_STOP)).toBe(true);
    }),
);

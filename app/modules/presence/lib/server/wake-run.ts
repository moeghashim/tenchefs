import { DateTime, Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";
import type { WakeRunFailure, WakeRunResponse } from "../../index.ts";
import { WakeRunFailureSchema, WakeRunResponseSchema } from "./wire.ts";
import { wakeRunFailurePath, wakeRunPath } from "../../index.ts";
import { Caller } from "../../../identities/server.ts";
import type { IdentityName } from "../../../identities/index.ts";
import type { Refusal } from "../../../http/index.ts";
import type { Route } from "../../../http/server.ts";
import type { WakeRunSaid } from "./reach.ts";
import { isoTimeOf } from "../../../time/server.ts";

const NOT_FOUND = 404;

const noRunner: Refusal = {
  code: "not_found",
  message: "You hold no live connection opened by `cookout runner`, so there is no wake run to start or end.",
  status: NOT_FOUND,
};

type SayWakeRun = (identity: IdentityName, said: WakeRunSaid) => Effect.Effect<boolean>;

function errorOf(failure: WakeRunFailure): string {
  if ("exitCode" in failure) {
    return `wake run exited ${String(failure.exitCode)}`;
  }
  return `wake run timed out after ${String(failure.timedOutAfterMinutes)} min`;
}

const failedAt = Effect.fnUntraced(function* failedRunResult(failure: WakeRunFailure) {
  const now = yield* DateTime.now;
  return { at: isoTimeOf(now), error: errorOf(failure), ok: false } as const;
});

function wakeRunRoutesOn<Needs>(wakeRun: Effect.Effect<SayWakeRun, never, Needs>): readonly Route<Needs | Caller>[] {
  const said = Effect.fnUntraced(function* sayWakeRunOfCaller(saying: WakeRunSaid) {
    const caller = yield* Caller;
    const say = yield* wakeRun;
    const held = yield* say(caller.name, saying);
    if (!held) {
      return yield* Effect.fail(noRunner);
    }
    const answered: WakeRunResponse = { wakeRun: saying.running };
    return yield* HttpServerResponse.schemaJson(WakeRunResponseSchema)(answered);
  });
  const failed = Effect.fnUntraced(function* sayFailedWakeRun() {
    const failure = yield* HttpServerRequest.schemaBodyJson(WakeRunFailureSchema);
    const result = yield* failedAt(failure);
    return yield* said({ failed: result, running: false });
  });
  return [
    { handle: () => said({ running: true }), method: "PUT", path: wakeRunPath },
    { handle: () => said({ running: false }), method: "DELETE", path: wakeRunPath },
    { handle: failed, method: "POST", path: wakeRunFailurePath },
  ];
}

export { wakeRunRoutesOn };

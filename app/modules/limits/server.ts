/**
 * The per-identity limits on the backend (ADR 0033): a token bucket of `COOKOUT_REQUESTS_PER_MINUTE` for every
 * request past the token gate, a tighter one of `COOKOUT_COMMAND_CALLS_PER_MINUTE` for command calls, and a cap of
 * `COOKOUT_STREAMS_PER_IDENTITY` open `/v1/events` streams. Each is kept in memory for the running server, keyed by
 * identity name, and timed by the Effect clock. Over one, a request is refused with 429 `rate_limited` (with
 * `details.retryAfterSeconds`) or `too_many_streams`.
 */
import { AddressLimit, Caller } from "../identities/server.ts";
import { Clock, Context, Effect, Layer, String as Str } from "effect";
import type { Config, Scope } from "effect";
import {
  noTokenRequestsPerMinute,
  requestsPerMinute,
  streamsPerIdentity,
  webhookCommandCallsPerMinute,
} from "../config/server.ts";
import type { Bucket } from "./lib/server/bucket.ts";
import { HttpServerRequest } from "effect/http";
import type { Identity } from "../identities/index.ts";
import type { Refusal } from "../http/index.ts";
import { take } from "./lib/server/bucket.ts";
import { webhookCommandCallsPath } from "../webhook-commands/index.ts";

const TOO_MANY_REQUESTS = 429;
const NO_STREAMS = 0;
const ONE_STREAM = 1;
const WEBHOOK_COMMAND_CALL = new RegExp(`^${Str.replace(":name", "[^/?]+")(webhookCommandCallsPath)}(?:\\?|$)`, "u");

type Admit = (identity: Identity) => Effect.Effect<void, Refusal>;

function rateLimited(what: string, retryAfterSeconds: number): Refusal {
  return {
    code: "rate_limited",
    details: { retryAfterSeconds },
    message: `Too many ${what}: try again in ${String(retryAfterSeconds)} s.`,
    status: TOO_MANY_REQUESTS,
  };
}

function tooManyStreams(most: number): Refusal {
  return {
    code: "too_many_streams",
    message: `This identity already has ${String(most)} open event streams: close one first.`,
    status: TOO_MANY_REQUESTS,
  };
}

function keyedBuckets(perMinute: number, what: string): (key: string) => Effect.Effect<void, Refusal> {
  const buckets = new Map<string, Bucket>();
  return (key) =>
    Effect.flatMap(Clock.currentTimeMillis, (nowMillis) => {
      const taken = take({ bucket: buckets.get(key), nowMillis, perMinute });
      buckets.set(key, taken.bucket);
      if (taken.admitted) {
        return Effect.void;
      }
      return Effect.fail(rateLimited(what, taken.retryAfterSeconds));
    });
}

function bucketsOf(perMinute: number, what: string): Admit {
  const admit = keyedBuckets(perMinute, `${what} from this identity`);
  return (identity) => admit(identity.name);
}

function streamPlaces(most: number): (identity: Identity) => Effect.Effect<void, Refusal, Scope.Scope> {
  const open = new Map<string, number>();
  function countOf(name: string): number {
    return open.get(name) ?? NO_STREAMS;
  }
  function acquire(name: string): Effect.Effect<void, Refusal> {
    return Effect.suspend(() => {
      if (countOf(name) >= most) {
        return Effect.fail(tooManyStreams(most));
      }
      open.set(name, countOf(name) + ONE_STREAM);
      return Effect.void;
    });
  }
  function release(name: string): Effect.Effect<void> {
    return Effect.sync(() => {
      open.set(name, countOf(name) - ONE_STREAM);
    });
  }
  return (identity) => Effect.acquireRelease(acquire(identity.name), () => release(identity.name));
}

function isWebhookCommandCall({ method, url }: HttpServerRequest.HttpServerRequest): boolean {
  return method === "POST" && WEBHOOK_COMMAND_CALL.test(url);
}

/** The limits of the running server. */
export interface LimitsService {
  /** Takes one of the identity's requests for the minute; 429 `rate_limited` if it has none left. */
  readonly admitRequest: Admit;
  /** Takes one of the identity's command calls for the minute; 429 `rate_limited` if it has none left. */
  readonly admitWebhookCommandCall: Admit;
  /** Holds one of the identity's open-stream places until the scope closes; 429 `too_many_streams` if none is free. */
  readonly holdStream: (identity: Identity) => Effect.Effect<void, Refusal, Scope.Scope>;
}

export class Limits extends Context.Service<Limits, LimitsService>()("@ai-hero/cookout/limits/server/Limits") {}

/** `Limits` with the limits from the settings, empty when the server starts. */
export const limitsLayer: Layer.Layer<Limits, Config.ConfigError> = Layer.effect(
  Limits,
  Effect.gen(function* limitsFromSettings() {
    const requests = yield* requestsPerMinute;
    const calls = yield* webhookCommandCallsPerMinute;
    const streams = yield* streamsPerIdentity;
    return {
      admitRequest: bucketsOf(requests, "requests"),
      admitWebhookCommandCall: bucketsOf(calls, "command calls"),
      holdStream: streamPlaces(streams),
    };
  }),
);

/**
 * Runs `effect` once the caller's request limit admits it and, for `POST /v1/commands/:name/calls`, its command-call
 * limit too.
 * @param effect What the request does.
 * @returns `effect`, refused first with 429 `rate_limited` while the caller is over a rate.
 */
export function withinRequestLimit<Value, Failure, Needs>(
  effect: Effect.Effect<Value, Failure, Needs>,
): Effect.Effect<Value, Failure | Refusal, Needs | Caller | Limits | HttpServerRequest.HttpServerRequest> {
  return Effect.gen(function* admitThenRun() {
    const limits = yield* Limits;
    const caller = yield* Caller;
    const request = yield* HttpServerRequest.HttpServerRequest;
    yield* limits.admitRequest(caller);
    if (isWebhookCommandCall(request)) {
      yield* limits.admitWebhookCommandCall(caller);
    }
    return yield* effect;
  });
}

/** Holds one of the caller's open-stream places until the scope closes; 429 `too_many_streams` if none is free. */
export const holdStreamPlace: Effect.Effect<void, Refusal, Caller | Limits | Scope.Scope> = Effect.gen(
  function* holdPlace() {
    const limits = yield* Limits;
    const caller = yield* Caller;
    yield* limits.holdStream(caller);
  },
);

/**
 * The per-address request limit of `COOKOUT_NO_TOKEN_REQUESTS_PER_MINUTE`, for the routes that need no token, keyed
 * by the request's client address (ADR 0148) and empty when the server starts.
 */
export const addressLimitLayer: Layer.Layer<AddressLimit, Config.ConfigError> = Layer.effect(
  AddressLimit,
  Effect.map(noTokenRequestsPerMinute, (perMinute) => ({
    admit: keyedBuckets(perMinute, "requests from this address"),
  })),
);

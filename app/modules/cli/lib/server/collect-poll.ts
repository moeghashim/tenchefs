import { Duration, Effect, Function, Option, Schema, Struct } from "effect";
import type { CallFailure } from "./adapters/sdk.ts";

const POLL_SECONDS = 2;

const pollEvery = Duration.seconds(POLL_SECONDS);

function isRateLimited(failure: CallFailure): boolean {
  return failure.code === "rate_limited";
}

const RateLimitedDetailsSchema = Schema.Struct({ retryAfterSeconds: Schema.Finite });
const isRateLimitedDetails = Schema.is(RateLimitedDetailsSchema);

function retryAfterOf({ details }: CallFailure): Duration.Duration {
  const seconds = Option.map(Option.liftPredicate(details, isRateLimitedDetails), Struct.get("retryAfterSeconds"));
  return Duration.seconds(Option.getOrElse(seconds, Function.constant(POLL_SECONDS)));
}

export function waitingOutRateLimits<Value>(
  again: Effect.Effect<Value, CallFailure>,
): (collect: Effect.Effect<Value, CallFailure>) => Effect.Effect<Value, CallFailure> {
  return Effect.catchIf(isRateLimited, (failure) => Effect.andThen(Effect.sleep(retryAfterOf(failure)), again));
}

export { pollEvery };

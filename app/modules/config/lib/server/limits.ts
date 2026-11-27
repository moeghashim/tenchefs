import { Config, Schema } from "effect";

const SMALLEST_LIMIT = 1;
const DEFAULT_REQUESTS_PER_MINUTE = 6000;
const DEFAULT_NO_TOKEN_REQUESTS_PER_MINUTE = 30;
const DEFAULT_WEBHOOK_COMMAND_CALLS_PER_MINUTE = 60;
const DEFAULT_STREAMS_PER_IDENTITY = 20;

export const requestsPerMinute = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SMALLEST_LIMIT)),
  "COOKOUT_REQUESTS_PER_MINUTE",
).pipe(Config.withDefault(DEFAULT_REQUESTS_PER_MINUTE));

export const noTokenRequestsPerMinute = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SMALLEST_LIMIT)),
  "COOKOUT_NO_TOKEN_REQUESTS_PER_MINUTE",
).pipe(Config.withDefault(DEFAULT_NO_TOKEN_REQUESTS_PER_MINUTE));

export const webhookCommandCallsPerMinute = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SMALLEST_LIMIT)),
  "COOKOUT_COMMAND_CALLS_PER_MINUTE",
).pipe(Config.withDefault(DEFAULT_WEBHOOK_COMMAND_CALLS_PER_MINUTE));

export const streamsPerIdentity = Config.schema(
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(SMALLEST_LIMIT)),
  "COOKOUT_STREAMS_PER_IDENTITY",
).pipe(Config.withDefault(DEFAULT_STREAMS_PER_IDENTITY));

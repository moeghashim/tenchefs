import { Array as Arr, Schema } from "effect";
import type { ErrorResponse, HealthResponse, SchemaProblems } from "../../index.ts";
import { IsoTimeSchema } from "../../../time/server.ts";
import { matchesWire } from "../../index.ts";

const SHORTEST_CODE = 1;
const ErrorCodeSchema = Schema.String.check(Schema.isMinLength(SHORTEST_CODE));
const ErrorBodySchema = Schema.Struct({
  code: ErrorCodeSchema,
  details: Schema.optionalKey(Schema.Unknown),
  message: Schema.String,
});

const PathPartSchema = Schema.Union([Schema.String, Schema.Finite]);
const SchemaProblemSchema = Schema.Struct({ message: Schema.String, path: Schema.Array(PathPartSchema) });

const contentSecurityPolicy = Arr.join(
  [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ],
  "; ",
);

const securityHeaders = {
  "content-security-policy": contentSecurityPolicy,
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

export const HealthResponseSchema = matchesWire<HealthResponse>()(
  Schema.Struct({ status: Schema.Literal("ok"), time: IsoTimeSchema }),
);

export const ErrorResponseSchema = matchesWire<ErrorResponse>()(Schema.Struct({ error: ErrorBodySchema }));

export const SchemaProblemsSchema = matchesWire<SchemaProblems>()(Schema.Array(SchemaProblemSchema));

export { contentSecurityPolicy, securityHeaders };

/**
 * The cookout's wire protocol, shared by the server, the SDK and the web: route
 * paths, the error body every refusal uses, the union of every error code, and
 * the check that ties each backend Schema to its plain-TS wire type.
 */
import { deactivatedQuietAgentErrorCodes, deactivationOfferErrorCodes, nudgeErrorCodes } from "../inbox/index.ts";
import { messageErrorCodes, scheduledMessageErrorCodes } from "../scheduled-messages/index.ts";
import type { IsoTime } from "../time/index.ts";
import { agentSessionErrorCodes } from "../agent-sessions/index.ts";
import { channelErrorCodes } from "../channels/index.ts";
import { commandErrorCodes } from "../commands/index.ts";
import { identityErrorCodes } from "../identities/index.ts";
import { limitErrorCodes } from "../limits/index.ts";
import { presenceErrorCodes } from "../presence/index.ts";
import { searchErrorCodes } from "../search/index.ts";

type Same<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type SameShape<Left, Right> = Same<Left, Right> extends true ? Same<keyof Left, keyof Right> : false;
type Matching<Schema extends { readonly Type: unknown }, Wire> =
  SameShape<Schema["Type"], Wire> extends true ? unknown : { readonly wireMismatch: Wire };

const ECHO_LIMIT = 100;
const ECHO_START = 0;

/** The path of the health check, the one route without a token. */
export const healthPath = "/v1/health";

/** The path a `POST` to cuts a test's `cuttableRelay`: it drops every connection through it and holds new requests. */
export const relayCutPath = "/__relay/cut";

/** The path a `POST` to restores a cut `cuttableRelay`: the requests it held go through, and new ones too. */
export const relayRestorePath = "/__relay/restore";

/**
 * The path a `POST` to opens another `cuttableRelay` to the same server, answering `{ url }`: one that is cut and
 * restored on its own, so tests running at once each cut only their own link.
 */
export const relayOpenPath = "/__relay/open";

/**
 * The path a `POST` to, with `{ days }`, moves the dev program's adjustable clock that many days forward, for a
 * browser test or screenshot that needs days to pass. `serve` has no such clock.
 */
export const clockForwardPath = "/__clock/forward";

/** The answer to the health check. */
export interface HealthResponse {
  readonly status: "ok";
  readonly time: IsoTime;
}

/** Every code a cookout server refuses with. */
export const errorCodes = [
  ...identityErrorCodes,
  ...channelErrorCodes,
  ...messageErrorCodes,
  ...nudgeErrorCodes,
  ...deactivationOfferErrorCodes,
  ...deactivatedQuietAgentErrorCodes,
  ...agentSessionErrorCodes,
  ...commandErrorCodes,
  ...limitErrorCodes,
  ...presenceErrorCodes,
  ...searchErrorCodes,
  "attachment_too_large",
  "too_many_attachments",
  "attachment_empty",
  "attachment_unnamed",
  "message_empty",
  "attachment_not_found",
  ...scheduledMessageErrorCodes,
  "not_found",
  "method_not_allowed",
  "invalid_path",
  "invalid_json",
  "invalid_request",
  "body_too_large",
  "foreign_host",
  "foreign_origin",
  "storage_unavailable",
  "internal_error",
] as const;

/** A code a cookout server refuses with. */
export type ErrorCode = (typeof errorCodes)[number];

/** The error body of a refusal, as the server builds it. */
export interface ErrorBody {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

/**
 * Every refusal's body on the wire. The server answers only with an
 * `ErrorCode`, but a client accepts any non-empty code, so a client older
 * than the server still reads the codes added after it.
 */
export interface ErrorResponse {
  readonly error: Omit<ErrorBody, "code"> & { readonly code: string };
}

/** One way a request broke a schema: what is wrong, and where (`path` from the body's top, such as `["data", "branch"]`). */
export interface SchemaProblem {
  readonly message: string;
  readonly path: readonly (string | number)[];
}

/** The `details` of an `invalid_request` refusal: every way the request broke its schema. */
export type SchemaProblems = readonly SchemaProblem[];

/** A refusal a backend handler fails with: the HTTP status and the error body to answer with. */
export type Refusal = ErrorBody & {
  readonly status: number;
};

/**
 * `value` as a refusal's message may echo it: at most 100 characters, then
 * `…`, so a caller's path or name can't make the message as long as the request.
 * @param value The path or name the caller sent.
 * @returns The text to put in the message.
 */
export function echoed(value: string): string {
  if (value.length <= ECHO_LIMIT) {
    return value;
  }
  return `${value.slice(ECHO_START, ECHO_LIMIT)}…`;
}

/**
 * Returns the backend Schema unchanged, and fails to compile unless the type it
 * decodes to and the wire type are assignable both ways and have the same keys.
 * @returns The check, which takes the Schema.
 */
export function matchesWire<Wire>(): <Schema extends { readonly Type: unknown }>(
  schema: Schema & Matching<Schema, Wire>,
) => Schema {
  return (schema) => schema;
}

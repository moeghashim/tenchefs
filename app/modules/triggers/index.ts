/**
 * The trigger URL on the wire (mattpocock/cookout#378), shared by the server, the SDK, the CLI and the web. An agent's
 * owner sets a URL and a token on the agent; when a message mentions the agent, the board POSTs `{ text }` to the URL
 * with the token in the `Authorization` header. The token is write-only: no answer ever holds it, the owner's
 * included. "Trigger URL" is UI copy, not a GLOSSARY.md term.
 */
import type { IsoTime } from "../time/index.ts";
import type { MessageId } from "../messages/index.ts";

declare const brand: unique symbol;

const NONE = 0;
const HTTP_OK_FIRST = 200;
const HTTP_OK_LAST = 299;

/**
 * Why a mention didn't call a trigger URL (mattpocock/cookout#644): `agent_session_live`, the agent held a live agent
 * session, which hears the mention through its inbox and stream, so a new run would only ask to join and be refused.
 */
export type TriggerSkip = "agent_session_live";

/** The reasons a mention calls no trigger URL. */
export const triggerSkips = ["agent_session_live"] as const satisfies readonly TriggerSkip[];

/**
 * How the last call to a trigger URL went: when it was made, and either the HTTP status the URL answered or, when it
 * answered nothing (a timeout, a refused connection), why. `ok` is true only for a `2xx`, or for a mention that called
 * nothing on purpose: then `skipped` says why, and it has no status or error, as it neither failed nor reached the URL.
 * A non-`2xx` answer whose body said something keeps the start of its error message as `error` too: the JSON
 * envelope's `error.message`, else the body as text, at most 200 characters, never the token or a header's value.
 */
export interface TriggerResult {
  readonly at: IsoTime;
  readonly ok: boolean;
  readonly status?: number;
  readonly error?: string;
  readonly skipped?: TriggerSkip;
}

/** What a `trigger failed` offline alert says: the message that didn't get through, and the status, error or both. */
export interface TriggerFailure {
  readonly message: MessageId;
  readonly status?: number;
  readonly error?: string;
}

/**
 * An agent's trigger URL as its owner reads it: the URL, the names of its extra headers (lowercased, only when it has
 * any) and its last result; never the token or a header's value.
 */
export interface Trigger {
  readonly url: string;
  readonly headerNames?: readonly string[];
  readonly lastResult?: TriggerResult;
}

/** The answer to reading, setting or clearing a trigger URL: the agent's, or `null` when it has none. */
export interface TriggerResponse {
  readonly trigger: Trigger | null;
}

/**
 * The token the board sends with each call to an agent's trigger URL. Only that call reads it: no answer, log line,
 * event or stream ever holds it.
 */
export type TriggerToken = string & { readonly [brand]: "TriggerToken" };

/**
 * Whether `value` can be a trigger token: anything but empty.
 * @param value The token as sent.
 * @returns Whether `value` is a `TriggerToken`.
 */
export function isTriggerToken(value: string): value is TriggerToken {
  return value.length > NONE;
}

/**
 * An extra header the board sends with each call to a trigger URL (mattpocock/cookout#440), such as the
 * `anthropic-version` a routine's fire URL asks for. Its value is treated like the token, since it may be secret: once
 * set, no answer, log line, event or stream holds it.
 */
export interface TriggerHeader {
  readonly name: string;
  readonly value: string;
}

/**
 * The body of setting a trigger URL: the URL, the token the board sends with each call, and up to 20 extra headers it
 * sends too. Setting replaces every header, so leaving `headers` out drops the old ones.
 */
export interface SetTriggerRequest {
  readonly url: string;
  readonly token: string;
  readonly headers?: readonly TriggerHeader[];
}

/**
 * `GET`, `PUT` and `DELETE /v1/identities/:name/trigger`: read, set (or replace) and clear an agent's trigger URL,
 * answering `TriggerResponse`. Only the agent's owner, or the agent that brought it in, may (403 `not_owner`); a human
 * has none (403 `identity_kind`). A URL that isn't `https` (or `http://localhost`, `127.0.0.1` or `[::1]` on a board
 * that allows it) is 400 `trigger_url_invalid`, and an empty token is 400 `trigger_token_missing`. An extra header the
 * board won't send is 400 `trigger_header_invalid`: a name that isn't an HTTP token, `Authorization` (the token sets
 * it), a hop-by-hop header, `Host`, `Content-Length` or `Content-Type`, a name given twice, an empty value or one with
 * a control character, or more than 20 headers.
 */
export const identityTriggerPath = "/v1/identities/:name/trigger";

/** The SDK's calls on an agent's trigger URL, each only for the agent's owner or the agent that brought it in. */
export interface TriggerCalls {
  /** `GET /v1/identities/:name/trigger`: the agent's trigger URL and its last result, or `null`; never the token. */
  readonly getTrigger: (agent: string) => Promise<TriggerResponse>;
  /** `PUT /v1/identities/:name/trigger`: sets or replaces the agent's trigger URL and token. */
  readonly setTrigger: (agent: string, request: SetTriggerRequest) => Promise<TriggerResponse>;
  /** `DELETE /v1/identities/:name/trigger`: clears the agent's trigger URL, answering `{ trigger: null }`. */
  readonly clearTrigger: (agent: string) => Promise<TriggerResponse>;
}

/** The code of a trigger URL the board won't call. */
export const triggerUrlInvalid = "trigger_url_invalid";

/** The code of setting a trigger URL with no token. */
export const triggerTokenMissing = "trigger_token_missing";

/** The code of setting a trigger URL with an extra header the board won't send. */
export const triggerHeaderInvalid = "trigger_header_invalid";

/** The codes setting a trigger URL is refused with. */
export const triggerErrorCodes = [triggerUrlInvalid, triggerTokenMissing, triggerHeaderInvalid] as const;

/**
 * Whether `status` is a `2xx`.
 * @param status The HTTP status a trigger URL answered.
 * @returns Whether the call succeeded.
 */
export function isOkStatus(status: number): boolean {
  return status >= HTTP_OK_FIRST && status <= HTTP_OK_LAST;
}

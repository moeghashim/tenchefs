/**
 * The one owner of `fetch` and of URL and query-string building, for the SDK
 * and the web. It speaks HTTP, JSON and Server-Sent Events and knows nothing
 * of what the bodies mean.
 */

type QueryValue = string | number | undefined;

interface ServerSentComment {
  readonly comment: string;
}

interface Parsed {
  readonly json?: unknown;
}

interface Field {
  readonly name: string;
  readonly value: string;
}

interface Frames {
  readonly events: readonly ServerSentFrame[];
  readonly rest: string;
}

const NO_PARAMS = 0;
const TRAILING_SLASHES = /\/+$/u;
const EVENT_END = /\r\n\r\n|\n\n|\r\r/u;
const LINE_END = /\r\n|\n|\r/u;
const LEADING_SPACE = /^ /u;
const DEFAULT_EVENT = "message";
const COMMENT_START = 1;
const FIRST = 0;
const LAST = -1;

function queryString(query: Readonly<Record<string, QueryValue>>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === "string" || typeof value === "number") {
      search.set(name, String(value));
    }
  }
  if (search.size === NO_PARAMS) {
    return "";
  }
  return `?${search.toString()}`;
}

function parsed(text: string): Parsed {
  try {
    const json: unknown = JSON.parse(text);
    return { json };
  } catch {
    return {};
  }
}

function fillParams(path: string, params: Readonly<Record<string, string>>): string {
  let filled = path;
  for (const [name, value] of Object.entries(params)) {
    filled = filled.replaceAll(new RegExp(`:${name}\\b`, "gu"), () => encodeURIComponent(value));
  }
  return filled;
}

function fieldOf(line: string): Field {
  const [name = "", ...rest] = line.split(":");
  return { name, value: rest.join(":").replace(LEADING_SPACE, "") };
}

function isField(line: string): boolean {
  return line !== "" && !line.startsWith(":");
}

function commentsIn(lines: readonly string[]): readonly ServerSentComment[] {
  return lines
    .filter((line) => line.startsWith(":"))
    .map((line) => ({ comment: line.slice(COMMENT_START).replace(LEADING_SPACE, "") }));
}

function eventsIn(block: string): readonly ServerSentFrame[] {
  const lines = block.split(LINE_END);
  const fields = lines.filter((line) => isField(line)).map((line) => fieldOf(line));
  const data = fields.filter(({ name }) => name === "data").map(({ value }) => value);
  if (data.length === NO_PARAMS) {
    return commentsIn(lines);
  }
  const [event = DEFAULT_EVENT] = fields
    .filter(({ name }) => name === "event")
    .map(({ value }) => value)
    .toReversed();
  return [{ data: data.join("\n"), event }];
}

function framesOf(text: string): Frames {
  const blocks = text.split(EVENT_END);
  const rest = blocks.slice(LAST).join("");
  return { events: blocks.slice(FIRST, LAST).flatMap((block) => eventsIn(block)), rest };
}

function chunksOf(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncIterable<Uint8Array> {
  return {
    [Symbol.asyncIterator]: () => ({
      async next(): Promise<IteratorResult<Uint8Array, Uint8Array | undefined>> {
        const read = await reader.read();
        return read;
      },
    }),
  };
}

async function* eventsFrom(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<ServerSentFrame, void> {
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of chunksOf(reader)) {
    const { events, rest } = framesOf(buffered + decoder.decode(chunk, { stream: true }));
    buffered = rest;
    yield* events;
  }
}

function trimmed(url: string): string {
  return url.replace(TRAILING_SLASHES, "");
}

function addressed(address: HttpAddress): string {
  const path = fillParams(address.path, address.params ?? {});
  return `${trimmed(address.baseUrl)}${path}${queryString(address.query ?? {})}`;
}

async function fetched(options: HttpRequest, accept: string): Promise<Response> {
  const headers = new Headers({ accept, ...options.headers });
  const init: RequestInit = { headers, method: options.method, redirect: "manual" };
  if (options.body instanceof FormData) {
    init.body = options.body;
  } else if ("body" in options) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(addressed(options), init);
  return response;
}

async function answerOf(response: Response): Promise<HttpResponse> {
  const text = await response.text();
  return { headers: response.headers, ok: response.ok, status: response.status, text, ...parsed(text) };
}

/** The HTTP methods the cookout's routes use. */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** One request to a cookout server. */
export interface HttpRequest {
  readonly baseUrl: string;
  readonly method: HttpMethod;
  /** A path such as `/v1/channels/:name`; each `:param` is filled from `params`, percent-encoded. */
  readonly path: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly headers?: Readonly<Record<string, string>>;
  /** Sent as JSON, or as `multipart/form-data` when it is a `FormData`. */
  readonly body?: unknown;
}

/** The answer to a request for bytes: the bytes when it succeeded, else the whole refusal. */
export type BytesResponse =
  | { readonly ok: true; readonly headers: Headers; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly response: HttpResponse };

/** The whole answer to one request. `json` is absent when the body is not JSON. */
export interface HttpResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly text: string;
  readonly json?: unknown;
}

/** One Server-Sent Event: its `event` name (`message` when it has none) and its `data`. */
export interface ServerSentEvent {
  readonly event: string;
  readonly data: string;
}

/** What an open stream sends: events, and the comments between them. */
export type ServerSentFrame = ServerSentEvent | ServerSentComment;

/** An open Server-Sent Events stream: its events and comments in order, until the server ends it or `close` is called. */
export interface OpenEventStream {
  readonly ok: true;
  readonly events: AsyncIterable<ServerSentFrame>;
  /** Drops the connection; the events then end. */
  readonly close: () => Promise<void>;
}

/** A stream the server refused, with its whole answer. */
export interface RefusedEventStream {
  readonly ok: false;
  readonly response: HttpResponse;
}

/** Where a request goes: everything in it that makes its URL. */
export type HttpAddress = Pick<HttpRequest, "baseUrl" | "path" | "params" | "query">;

/** The URL a request to `address` goes to, for a reader that opens it itself (a browser's `EventSource`). */
export const urlOf: (address: HttpAddress) => string = addressed;

/**
 * `url` without its trailing slashes, so the same server always has the same base URL.
 * @param url The server's URL as given.
 * @returns The base URL.
 */
export function baseUrlOf(url: string): string {
  return trimmed(url);
}

/**
 * Sends one request and reads the whole answer. A redirect is never followed,
 * so the headers (the token) go only to `baseUrl`: the
 * redirect itself is the answer.
 * @param options The request.
 * @returns The answer.
 */
export async function request(options: HttpRequest): Promise<HttpResponse> {
  const response = await fetched(options, "application/json");
  return answerOf(response);
}

/**
 * Sends one request and reads the answer as bytes, as `request` does but for a body that isn't JSON or text.
 * @param options The request.
 * @returns The bytes, or the refusal read whole.
 */
export async function requestBytes(options: HttpRequest): Promise<BytesResponse> {
  const response = await fetched(options, "*/*");
  if (!response.ok) {
    const refused = await answerOf(response);
    return { ok: false, response: refused };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, headers: response.headers, ok: true };
}

/**
 * Opens a Server-Sent Events stream with one request, resolving once the
 * server has answered with its headers. A redirect is never followed, as in
 * `request`. An answer that isn't a 2xx is read whole and comes back refused.
 * @param options The request.
 * @returns The open stream, or the refusal.
 */
export async function openEventStream(options: HttpRequest): Promise<OpenEventStream | RefusedEventStream> {
  const response = await fetched(options, "text/event-stream");
  if (!response.ok || response.body === null) {
    const refused = await answerOf(response);
    return { ok: false, response: refused };
  }
  const reader = response.body.getReader();
  return {
    async close(): Promise<void> {
      await reader.cancel();
    },
    events: eventsFrom(reader),
    ok: true,
  };
}

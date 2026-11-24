import { CookoutError, isServerErrorCode } from "./errors.ts";
import type { HttpMethod, HttpRequest, HttpResponse, OpenEventStream } from "../../http/client.ts";
import { openEventStream, request, requestBytes } from "../../http/client.ts";
import type { CookoutConnection } from "../../config/index.ts";
import { harnessHeader } from "../../identities/index.ts";
import { isErrorResponse } from "./generated/validators.js";
import { readCookoutConnection } from "../../config/index.ts";

type ClientConnection = CookoutConnection;

interface ConnectionOptions extends Partial<CookoutConnection> {
  readonly env?: Readonly<Record<string, string | undefined>>;
}

interface Call<Answer> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: NonNullable<HttpRequest["query"]>;
  readonly body?: unknown;
  readonly isExpected: (body: unknown) => body is Answer;
}

interface EventsCall {
  readonly connection: ClientConnection;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
}

const NO_STATUS = 0;
const NO_HEADERS = {};

function tokenHeaders(token: string | undefined): Readonly<Record<string, string>> {
  if (typeof token === "string") {
    return { authorization: `Bearer ${token}` };
  }
  return NO_HEADERS;
}

function harnessHeaders(harness: string | undefined): Readonly<Record<string, string>> {
  if (typeof harness === "string") {
    return { [harnessHeader]: harness };
  }
  return NO_HEADERS;
}

function headersFor({ harness, token }: ClientConnection): Readonly<Record<string, string>> {
  return { ...tokenHeaders(token), ...harnessHeaders(harness) };
}

function fromEnvironment(env: ConnectionOptions["env"], given: Partial<CookoutConnection>): Partial<CookoutConnection> {
  const { harness, ...read } = readCookoutConnection(env);
  if (typeof given.token !== "string" && typeof harness === "string") {
    return { ...read, harness };
  }
  return read;
}

function refusal(method: HttpMethod, path: string, response: HttpResponse): CookoutError {
  const { json, status, text } = response;
  if (isErrorResponse(json) && isServerErrorCode(json.error.code)) {
    return new CookoutError({ ...json.error, code: json.error.code, status });
  }
  return new CookoutError({
    code: "bad_response",
    details: text,
    message: `${method} ${path} failed with ${String(status)} and no error body.`,
    status,
  });
}

function badBody(method: HttpMethod, path: string, { json, status }: HttpResponse): CookoutError {
  return new CookoutError({
    code: "bad_response",
    details: json,
    message: `${method} ${path} returned a body that doesn't match the protocol.`,
    status,
  });
}

export async function send<Answer>(connection: ClientConnection, call: Call<Answer>): Promise<Answer> {
  const { isExpected, method, path, ...rest } = call;
  const response = await request({ ...rest, baseUrl: connection.url, headers: headersFor(connection), method, path });
  if (!response.ok) {
    throw refusal(method, path, response);
  }
  if (!isExpected(response.json)) {
    throw badBody(method, path, response);
  }
  return response.json;
}

export async function sendForBytes({
  connection,
  method,
  path,
  params = {},
}: Pick<Call<unknown>, "method" | "path" | "params"> & { readonly connection: ClientConnection }): Promise<{
  readonly bytes: Uint8Array;
  readonly headers: Headers;
}> {
  const answered = await requestBytes({
    baseUrl: connection.url,
    headers: headersFor(connection),
    method,
    params,
    path,
  });
  if (!answered.ok) {
    throw refusal(method, path, answered.response);
  }
  return answered;
}

export async function openEvents({ connection, headers, path, query = {} }: EventsCall): Promise<OpenEventStream> {
  const method = "GET";
  const sent = { ...headers, ...headersFor(connection) };
  const opened = await openEventStream({ baseUrl: connection.url, headers: sent, method, path, query });
  if (!opened.ok) {
    throw refusal(method, path, opened.response);
  }
  return opened;
}

export function connectionFor({ env, ...given }: ConnectionOptions): ClientConnection {
  const connection = { ...fromEnvironment(env, given), ...given };
  const { url = "" } = connection;
  if (url === "") {
    throw new CookoutError({
      code: "url_missing",
      message:
        "Set COOKOUT_URL to the cookout server's address. The cookout CLI also uses the board `cookout login` last chose.",
      status: NO_STATUS,
    });
  }
  return { ...connection, url };
}

export async function getJson<Answer>(
  connection: ClientConnection,
  path: string,
  isExpected: (body: unknown) => body is Answer,
): Promise<Answer> {
  const answer = await send(connection, { isExpected, method: "GET", path });
  return answer;
}

export type { ClientConnection };

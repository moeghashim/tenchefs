/**
 * The cookout's HTTP server on Node's HTTP server: routing, `/v1/health`, the body size limit, the web guards, and
 * the one place a failure becomes an `{ error }` body. A handler fails with a `Refusal` to answer with it; storage,
 * body and path failures are answered by kind, and anything else is a 500. Given a web folder, it also serves the
 * built web UI: `index.html` at `/` and the build's files under `/assets/`, with no token.
 */
import {
  Boolean as Bool,
  ByteSize,
  DateTime,
  Effect,
  FileSystem,
  Function,
  Layer,
  Option,
  Path,
  Predicate,
  Record as Rec,
  String as Str,
  Struct,
} from "effect";
import {
  ErrorResponseSchema,
  HealthResponseSchema,
  SchemaProblemsSchema,
  flyReportOf,
  securityHeaders,
  strictTransportSecurity,
} from "./lib/server/wire.ts";
import type { Gate, Route } from "./lib/server/router.ts";
import { HttpIncomingMessage, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { guardRefusal, notFound, respond, toRefusal } from "./lib/server/refusals.ts";
import type { HttpPlatform } from "effect/http";
import type { Refusal } from "./index.ts";
import { Storage } from "../storage/server.ts";
import { dispatch } from "./lib/server/router.ts";
import { healthPath } from "./index.ts";
import { isoTimeOf } from "../time/server.ts";
import { layer as nodeHttpLayer } from "@effect/platform-node/NodeHttpServer";
import { serverDroppingSilentConnections } from "./lib/server/node-http-server.ts";

interface Listen {
  readonly host: string;
  readonly port: number;
}

interface Serving extends Listen {
  readonly webFolder?: string;
  readonly publicUrl?: string;
  readonly behindFly?: boolean;
}

interface ServedRoutes<Needs, OpenNeeds> {
  readonly gated: readonly Route<Needs>[];
  readonly open?: readonly Route<OpenNeeds>[];
}

type NodeHttp = ReturnType<typeof nodeHttpLayer>;

const MEBIBYTE = 1_048_576;
const maxBodySize = ByteSize.bytes(MEBIBYTE);

const healthRoute: Route<Storage> = {
  handle: () =>
    Effect.gen(function* healthCheck() {
      const storage = yield* Storage;
      yield* storage.checkHealth();
      const now = yield* DateTime.now;
      const time = isoTimeOf(now);
      return yield* HttpServerResponse.schemaJson(HealthResponseSchema)({ status: "ok", time });
    }),
  method: "GET",
  path: healthPath,
};

type WebNeeds = FileSystem.FileSystem | HttpPlatform.HttpPlatform | Path.Path;

const ASSET_NAME = /^[\w-][\w.-]*$/u;

function isAssetName(segment: string): boolean {
  return ASSET_NAME.test(segment);
}

function webFile(
  webFolder: string,
  urlPath: string,
  file: readonly string[],
): Effect.Effect<HttpServerResponse.HttpServerResponse, Refusal, WebNeeds> {
  return Effect.gen(function* serveWebFile() {
    const path = yield* Path.Path;
    return yield* HttpServerResponse.file(path.join(webFolder, ...file));
  }).pipe(Effect.catchTag("PlatformError", () => Effect.fail(notFound("GET", urlPath))));
}

const LINK_PREVIEW_PATH = /(?<tag><meta\s+property="og:(?:image|url)"\s+content=")\//gu;

function withAbsolutePreview(html: string, publicUrl: string): string {
  const { origin } = new URL(publicUrl);
  return Str.replaceAll(LINK_PREVIEW_PATH, `$<tag>${origin}/`)(html);
}

function indexPage(
  webFolder: string,
  publicUrl: string,
): Effect.Effect<HttpServerResponse.HttpServerResponse, Refusal, WebNeeds> {
  if (publicUrl === "") {
    return webFile(webFolder, "/", ["index.html"]);
  }
  return Effect.gen(function* serveIndexPage() {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const html = yield* fs.readFileString(path.join(webFolder, "index.html"));
    return HttpServerResponse.text(withAbsolutePreview(html, publicUrl), { contentType: "text/html" });
  }).pipe(Effect.catchTag("PlatformError", () => Effect.fail(notFound("GET", "/"))));
}

function webRoutesIn(webFolder: string, publicUrl: string): readonly Route<WebNeeds>[] {
  return [
    { handle: () => indexPage(webFolder, publicUrl), method: "GET", path: "/" },
    {
      handle: ({ file = "" }) => webFile(webFolder, `/assets/${file}`, ["assets", file]),
      method: "GET",
      path: "/assets/:file",
      segments: { file: isAssetName },
    },
  ];
}

function webRoutes({ publicUrl = "", webFolder }: Serving): readonly Route<WebNeeds>[] {
  return Option.match(Option.fromNullishOr(webFolder), {
    onNone: () => [],
    onSome: (folder) => webRoutesIn(folder, publicUrl),
  });
}

function withSecurityHeaders(
  response: HttpServerResponse.HttpServerResponse,
  secure: boolean,
): HttpServerResponse.HttpServerResponse {
  let wanted: Readonly<Record<string, string>> = securityHeaders;
  if (secure) {
    wanted = { ...securityHeaders, ...strictTransportSecurity };
  }
  const missing = Rec.filter(wanted, (_value, name) => !Predicate.hasProperty(response.headers, name));
  return HttpServerResponse.setHeaders(response, missing);
}

function seenThroughFly(request: HttpServerRequest.HttpServerRequest): HttpServerRequest.HttpServerRequest {
  const { address, protocol } = flyReportOf(request.headers);
  const remoteAddress = Option.orElse(Option.liftPredicate(address, Str.isNonEmpty), () => request.remoteAddress);
  return request.modify({ protocol, remoteAddress });
}

function seenThroughProxy<Value, Failure, Needs>(
  behindFly: boolean,
  app: Effect.Effect<Value, Failure, Needs>,
): Effect.Effect<Value, Failure, Needs | HttpServerRequest.HttpServerRequest> {
  if (!behindFly) {
    return app;
  }
  return Effect.updateService(app, HttpServerRequest.HttpServerRequest, seenThroughFly);
}

const requestClientAddress: Effect.Effect<string, never, HttpServerRequest.HttpServerRequest> = Effect.map(
  HttpServerRequest.HttpServerRequest,
  ({ remoteAddress }) => Option.getOrElse(remoteAddress, Function.constant("unknown")),
);

const requestOverHttps: Effect.Effect<boolean, never, HttpServerRequest.HttpServerRequest> =
  HttpServerRequest.HttpServerRequest.pipe(
    Effect.map(HttpServerRequest.toURL),
    Effect.map((url) => Option.contains(Option.map(url, Struct.get("protocol")), "https:")),
  );

const siteCookie = { httpOnly: true, path: "/", sameSite: "strict" } as const;

function answerFailure(failure: unknown): Effect.Effect<HttpServerResponse.HttpServerResponse> {
  return respond(toRefusal(failure));
}

function isHealthCheck(method: string, url: string): boolean {
  return method === "GET" && new URL(url, "http://health.invalid").pathname === healthPath;
}

function guardRequest(
  publicUrl: string,
): Effect.Effect<void, Refusal, HttpServerRequest.HttpServerRequest | HttpServer.HttpServer> {
  return Effect.gen(function* guardHostAndOrigin() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    if (isHealthCheck(request.method, request.url)) {
      return yield* Effect.void;
    }
    const server = yield* HttpServer.HttpServer;
    const { host = "", origin = "" } = request.headers;
    const address = HttpServer.formatAddress(server.address);
    const refused = guardRefusal({ address, host, method: request.method, origin, publicUrl });
    return yield* Option.match(refused, { onNone: () => Effect.void, onSome: Effect.fail });
  });
}

/**
 * A relay in front of the server at `target`, for tests that need a client's connection to drop: `cut` ends every
 * response streaming through it (a live stream included) and holds every new request until `restore`, which lets
 * the held requests through. A `POST` to `relayCutPath` or `relayRestorePath` on the relay does the same, for a test
 * in another process, such as a browser test, and a `POST` to `relayOpenPath` opens another relay to the same server,
 * cut and restored on its own and closed with this one, so browser tests running at once each cut only their own.
 * The relay forwards no `Origin`, so a page loaded through it can write.
 * It listens on a free loopback port and closes with the scope.
 */
export { cuttableRelay } from "./lib/server/cuttable-relay.ts";
export type { Gate, Route } from "./lib/server/router.ts";

/**
 * The one Content-Security-Policy every response of the cookout carries, and the one the dev program's Vite server
 * sends with the web UI, so a page the CSP blocks fails in dev and in browser tests as it does on the live board.
 */
export { contentSecurityPolicy } from "./lib/server/wire.ts";
export type { Listen, Serving };

/** The response Schemas of `/v1/health`, of every refusal and of an `invalid_request` refusal's details, for the SDK's generated validators. */
export const httpResponseSchemas = {
  ErrorResponse: ErrorResponseSchema,
  HealthResponse: HealthResponseSchema,
  SchemaProblems: SchemaProblemsSchema,
};

/**
 * Node's HTTP server on `listen`, for any `HttpServer.serve` app: the one
 * place `node:http` is opened. Port 0 picks a free port; the server closes
 * with the Layer's scope. Closing waits for the requests still being
 * answered, but first drops every connection that has sent nothing: Node's
 * own close waits for such a connection as if a request were on its way, and Node's fetch leaves one open (opened for a request
 * that was then aborted) until its keep-alive time, about 3 s.
 * @param listen The port and host to listen on.
 * @returns The `HttpServer` and Node's HTTP platform.
 */
export function nodeHttpServer(listen: Listen): NodeHttp {
  return Layer.unwrap(
    Effect.sync(() => {
      const { dropSilent, server } = serverDroppingSilentConnections();
      const node = nodeHttpLayer(() => server, { ...listen, disablePreemptiveShutdown: true });
      return Layer.provideMerge(Layer.effectDiscard(Effect.addFinalizer(() => dropSilent)), node);
    }),
  );
}

/**
 * Serves `/v1/health` and the given routes on `listen` until the Layer is released. A route's `segments` give the
 * pattern each named `:param` segment must match; a path that breaks one is no route's (404 `not_found`). Every request
 * to a path one of `routes` serves goes through `gate` first, before a wrong method is refused with 405; `/v1/health`
 * and unknown paths (404) never do. The `HttpServer` it provides says which address it took: port 0 picks a free one.
 * With a `webFolder`, `/` answers with its `index.html` and `/assets/<file>` with its `assets/<file>`, also without the
 * gate; a file the folder lacks is 404 `not_found`. With a `publicUrl` too, the page's `og:image` and `og:url` paths
 * are made absolute against it, since link-preview services can't follow a relative one. Every request goes through the
 * web guards first: a `Host` that isn't the server's own (or the host of `publicUrl`) is refused with 421
 * `foreign_host`, except at `GET /v1/health`, which shows no data and answers any `Host` so a platform's probe needs
 * none (mattpocock/cookout#489), a write from another site's `Origin` with 403 `foreign_origin`, and every response
 * carries a strict CSP and refuses framing, and over HTTPS HSTS too.
 * @param serving The port and host to listen on, the folder of the built web UI if it serves one, and the public URL if it has one.
 * @param routes Every route but `/v1/health`: the `gated` ones, and the `open` ones that need no token and never go through `gate`.
 * @param gate What every request to one of the `gated` routes goes through first.
 * @returns The server, as a Layer.
 */
export function httpServer<Needs, Provides, Requires, Fails, OpenNeeds = never>(
  serving: Serving,
  routes: ServedRoutes<Needs, OpenNeeds>,
  gate: Gate<Provides, Requires, Fails>,
) {
  const { behindFly = false, host, port, publicUrl = "" } = serving;
  const { gated, open: openRoutes = [] } = routes;
  const open: readonly Route<Storage | WebNeeds | OpenNeeds>[] = [healthRoute, ...webRoutes(serving), ...openRoutes];
  const answered = Effect.andThen(guardRequest(publicUrl), dispatch({ gate, gated, open })).pipe(
    Effect.catch(answerFailure),
    Effect.zipWith(requestOverHttps, withSecurityHeaders),
  );
  const app = seenThroughProxy(behindFly, answered).pipe(
    Effect.provideService(HttpIncomingMessage.MaxBodySize, maxBodySize),
  );
  return Layer.provideMerge(HttpServer.serve(app), nodeHttpServer({ host, port }));
}

/** The base URL a running `httpServer` answers on, such as `http://127.0.0.1:54321`. */
export const serverUrl: Effect.Effect<string, never, HttpServer.HttpServer> = Effect.map(
  HttpServer.HttpServer,
  (server) => HttpServer.formatAddress(server.address),
);

/** The request's client address (ADR 0148): behind Fly its `Fly-Client-IP`, elsewhere the socket's, header ignored. */
export const clientAddress = requestClientAddress;

/** A cookie only this site's own pages send, for the whole site and out of scripts' reach: `Secure` over HTTPS (ADR 0148: on an encrypted socket, or behind Fly by `X-Forwarded-Proto`). */
export const siteCookieOptions = Effect.map(requestOverHttps, (secure) => ({ ...siteCookie, secure }));

/** The origin the request came to: `https://` or `http://` as it came over HTTPS (ADR 0148), then its `Host`, which the guards checked. */
export const requestOrigin: Effect.Effect<string, never, HttpServerRequest.HttpServerRequest> = Effect.zipWith(
  Effect.map(requestOverHttps, (secure) => Bool.match(secure, { onFalse: () => "http", onTrue: () => "https" })),
  HttpServerRequest.HttpServerRequest,
  (scheme, { headers }) => `${scheme}://${String(headers["host"])}`,
);

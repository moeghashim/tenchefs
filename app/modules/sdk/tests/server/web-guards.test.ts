import { Array as Arr, Effect, String as Str } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { NodeHttpClient } from "@effect/platform-node";
import { channelsPath } from "../../../channels/index.ts";
import { healthPath } from "../../../http/index.ts";
import { request } from "../../../http/client.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const MISDIRECTED = 421;
const FOREIGN_ORIGIN = "https://elsewhere.example";
const PUBLIC_URL = "https://cookout.example";
const STRICT_POLICY = /^default-src 'none';.*frame-ancestors 'none'$/u;
const LIVE_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
];

function withHost(
  url: string,
  host: string,
  path: string = channelsPath,
): Effect.Effect<{ readonly json: unknown; readonly status: number }> {
  return Effect.gen(function* sendWithHost() {
    const client = yield* HttpClient.HttpClient;
    const response = yield* client.execute(
      HttpClientRequest.get(`${url}${path}`).pipe(HttpClientRequest.setHeader("host", host)),
    );
    const json = yield* response.json;
    return { json, status: response.status };
  }).pipe(Effect.provide(NodeHttpClient.layerNodeHttp), Effect.orDie);
}

it.effect("a write whose Origin is another site's, or opaque, is refused with 403 foreign_origin", () =>
  Effect.gen(function* foreignOriginWrite() {
    const cookout = yield* TestCookout;
    const write = { baseUrl: cookout.url, body: { name: "general" }, method: "POST", path: channelsPath } as const;
    const foreign = yield* answer(() => request({ ...write, headers: { origin: FOREIGN_ORIGIN } }));
    const opaque = yield* answer(() => request({ ...write, headers: { origin: "null" } }));
    const own = yield* answer(() => request({ ...write, headers: { origin: cookout.url } }));

    expect(foreign.status).toBe(FORBIDDEN);
    expect([foreign.json, opaque.json]).toMatchObject([
      { error: { code: "foreign_origin" } },
      { error: { code: "foreign_origin" } },
    ]);
    expect(own.json).toMatchObject({ error: { code: "token_missing" } });
    expect(own.status).toBe(UNAUTHORIZED);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a read from another site's Origin is still answered", () =>
  Effect.gen(function* foreignOriginRead() {
    const cookout = yield* TestCookout;
    const read = yield* answer(() =>
      request({ baseUrl: cookout.url, headers: { origin: FOREIGN_ORIGIN }, method: "GET", path: healthPath }),
    );

    expect(read.status).toBe(OK);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a request whose Host isn't the server's own is refused with 421 foreign_host", () =>
  Effect.gen(function* foreignHost() {
    const cookout = yield* TestCookout;
    const { port } = new URL(cookout.url);
    const foreign = yield* withHost(cookout.url, `elsewhere.example:${port}`);
    const localhost = yield* withHost(cookout.url, `localhost:${port}`);

    expect(foreign).toMatchObject({ json: { error: { code: "foreign_host" } }, status: MISDIRECTED });
    expect(localhost.status).toBe(UNAUTHORIZED);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the health check is answered whatever the Host, so a platform's probe needs no Host of its own", () =>
  Effect.gen(function* healthAnyHost() {
    const cookout = yield* TestCookout;
    const health = yield* withHost(cookout.url, "[fdaa:0:1::2]:8080", healthPath);
    const other = yield* withHost(cookout.url, "[fdaa:0:1::2]:8080");

    expect(health).toMatchObject({ json: { status: "ok" }, status: OK });
    expect(other).toMatchObject({ json: { error: { code: "foreign_host" } }, status: MISDIRECTED });
  }).pipe(Effect.provide(testCookout())),
);

it.effect(
  "the host of COOKOUT_PUBLIC_URL is answered as the server's own, for reads and for writes from its pages",
  () =>
    Effect.gen(function* publicHost() {
      const cookout = yield* TestCookout;
      const { port } = new URL(cookout.url);
      const read = yield* withHost(cookout.url, "cookout.example");
      const foreign = yield* withHost(cookout.url, `elsewhere.example:${port}`);
      const write = yield* answer(() =>
        request({
          baseUrl: cookout.url,
          body: { name: "general" },
          headers: { origin: PUBLIC_URL },
          method: "POST",
          path: channelsPath,
        }),
      );

      expect(read.status).toBe(UNAUTHORIZED);
      expect(foreign.status).toBe(MISDIRECTED);
      expect(write.json).toMatchObject({ error: { code: "token_missing" } });
    }).pipe(Effect.provide(testCookout({ publicUrl: PUBLIC_URL }))),
);

it.effect("every response carries a strict CSP without unsafe-inline and refuses framing", () =>
  Effect.gen(function* securityHeaders() {
    const cookout = yield* TestCookout;
    const health = yield* answer(() => request({ baseUrl: cookout.url, method: "GET", path: healthPath }));
    const missing = yield* answer(() => request({ baseUrl: cookout.url, method: "GET", path: "/v1/no-such-route" }));
    const refused = yield* answer(() =>
      request({ baseUrl: cookout.url, headers: { origin: FOREIGN_ORIGIN }, method: "DELETE", path: channelsPath }),
    );
    const responses = [health, missing, refused];
    const frames = Arr.map(responses, (response) => response.headers.get("x-frame-options"));
    const policies = Arr.map(responses, (response) => response.headers.get("content-security-policy") ?? "");

    expect(frames).toStrictEqual(["DENY", "DENY", "DENY"]);
    expect(Arr.every(policies, (policy) => STRICT_POLICY.test(policy))).toBe(true);
    expect(Arr.join(policies, " ")).not.toContain("unsafe-inline");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("the CSP lets images load from blob: URLs, a pasted file's preview, and changes no other directive", () =>
  Effect.gen(function* blobImages() {
    const cookout = yield* TestCookout;
    const health = yield* answer(() => request({ baseUrl: cookout.url, method: "GET", path: healthPath }));
    const policy = health.headers.get("content-security-policy") ?? "";
    const directives = Arr.map(Str.split(policy, ";"), Str.trim);

    expect(directives).toStrictEqual(LIVE_DIRECTIVES);
  }).pipe(Effect.provide(testCookout())),
);

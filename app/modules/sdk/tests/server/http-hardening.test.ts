import { Array as Arr, Effect, String as Str } from "effect";
import { TestCookout, answer, testCookout } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import type { HttpResponse } from "../../../http/client.ts";
import { loginRequestsPath } from "../../../logins/index.ts";
import { request } from "../../../http/client.ts";
import { sessionPath } from "../../../identities/index.ts";

const OK = 200;
const CREATED = 201;
const TOO_MANY = 429;
const NO_TOKEN_RATE = 30;
const ONE = 1;
const onFly = { flyAppName: "cookout-test" };
const hsts = "strict-transport-security";

function logIn(url: string, token: string, headers: Readonly<Record<string, string>>): Effect.Effect<HttpResponse> {
  return answer(() =>
    request({
      baseUrl: url,
      headers: { authorization: `Bearer ${token}`, ...headers },
      method: "POST",
      path: sessionPath,
    }),
  );
}

function cookieAttributes(response: HttpResponse): readonly string[] {
  return Arr.flatMap(response.headers.getSetCookie(), Str.split("; "));
}

function startLoginFrom(url: string, headers: Readonly<Record<string, string>>): Effect.Effect<number> {
  return Effect.map(
    answer(() =>
      request({ baseUrl: url, body: { host: "ada-laptop" }, headers, method: "POST", path: loginRequestsPath }),
    ),
    ({ status }) => status,
  );
}

function fromAddress(address: string): Readonly<Record<string, string>> {
  return { "fly-client-ip": address };
}

it.effect("a web login Fly reports as HTTPS sets a Secure cookie and sends HSTS", () =>
  Effect.gen(function* secureLogin() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const response = yield* logIn(cookout.url, ada.token, { "x-forwarded-proto": "https" });

    expect(response.status).toBe(OK);
    expect(cookieAttributes(response)).toContain("Secure");
    expect(response.headers.get(hsts)).toBe("max-age=31536000");
  }).pipe(Effect.provide(testCookout(onFly))),
);

it.effect("a web login over plain HTTP sets no Secure cookie and no HSTS, and the cookie still logs in", () =>
  Effect.gen(function* plainLogin() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const response = yield* logIn(cookout.url, ada.token, {});
    const [cookie = ""] = cookieAttributes(response);
    const whoami = yield* answer(() =>
      request({ baseUrl: cookout.url, headers: { cookie }, method: "GET", path: "/v1/whoami" }),
    );

    expect(cookieAttributes(response)).not.toContain("Secure");
    expect(response.headers.get(hsts)).toBeNull();
    expect(whoami.json).toMatchObject({ identity: { name: "ada" } });
  }).pipe(Effect.provide(testCookout(onFly))),
);

it.effect("off Fly, a request claiming HTTPS through X-Forwarded-Proto gets no Secure cookie and no HSTS", () =>
  Effect.gen(function* forgedProto() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const response = yield* logIn(cookout.url, ada.token, { "x-forwarded-proto": "https" });

    expect(cookieAttributes(response)).not.toContain("Secure");
    expect(response.headers.get(hsts)).toBeNull();
  }).pipe(Effect.provide(testCookout())),
);

it.effect("on Fly, requests with different Fly-Client-IP values fall in different no-token buckets", () =>
  Effect.gen(function* flyBuckets() {
    const cookout = yield* TestCookout;
    const first = yield* startLoginFrom(cookout.url, fromAddress("203.0.113.1"));
    const second = yield* startLoginFrom(cookout.url, fromAddress("203.0.113.2"));

    expect([first, second]).toStrictEqual([CREATED, CREATED]);
  }).pipe(Effect.provide(testCookout({ ...onFly, noTokenRequestsPerMinute: ONE }))),
);

it.effect("off Fly, Fly-Client-IP is ignored and requests from one socket share one no-token bucket", () =>
  Effect.gen(function* forgedAddress() {
    const cookout = yield* TestCookout;
    const first = yield* startLoginFrom(cookout.url, fromAddress("203.0.113.1"));
    const second = yield* startLoginFrom(cookout.url, fromAddress("203.0.113.2"));

    expect([first, second]).toStrictEqual([CREATED, TOO_MANY]);
  }).pipe(Effect.provide(testCookout({ noTokenRequestsPerMinute: ONE }))),
);

it.effect("the 31st no-token request in a minute from one address is refused, while another address is admitted", () =>
  Effect.gen(function* thirtyFirst() {
    const cookout = yield* TestCookout;
    const ann = fromAddress("203.0.113.1");
    const admitted = yield* Effect.forEach(Arr.range(ONE, NO_TOKEN_RATE), () => startLoginFrom(cookout.url, ann), {
      concurrency: 1,
    });
    const refused = yield* answer(() =>
      request({ baseUrl: cookout.url, body: { host: "x" }, headers: ann, method: "POST", path: loginRequestsPath }),
    );
    const other = yield* startLoginFrom(cookout.url, fromAddress("203.0.113.2"));

    expect(Arr.dedupe(admitted)).toStrictEqual([CREATED]);
    expect(refused).toMatchObject({ json: { error: { code: "rate_limited" } }, status: TOO_MANY });
    expect(other).toBe(CREATED);
  }).pipe(Effect.provide(testCookout(onFly))),
);

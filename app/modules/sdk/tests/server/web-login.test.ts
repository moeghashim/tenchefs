import { Array as Arr, Effect, Predicate, String as Str } from "effect";
import type { CookoutClient, Token } from "../../index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { collectLoginRequestPath, loginRequestsPath, sessionsPath } from "../../../logins/index.ts";
import { expect, it } from "@effect/vitest";
import { sessionCookieName, token } from "../../../identities/index.ts";
import type { HttpResponse } from "../../../http/client.ts";
import { request } from "../../../http/client.ts";

const OK = 200;
const ACCEPTED = 202;
const NOT_FOUND = 404;
const NO_COOKIE = "";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0";
const SOME_TEXT: unknown = expect.any(String);

interface Started {
  readonly requestId: Token;
  readonly userCode: string;
}

function inFirefox(url: string, path: string, body: object): Effect.Effect<HttpResponse> {
  return answer(() => request({ baseUrl: url, body, headers: { "user-agent": FIREFOX }, method: "POST", path }));
}

function textAt(json: unknown, key: string): string {
  if (Predicate.hasProperty(json, key) && Predicate.isString(json[key])) {
    return json[key];
  }
  return expect.unreachable(`The answer has no ${key}.`);
}

function startInFirefox(url: string): Effect.Effect<Started> {
  return Effect.map(inFirefox(url, loginRequestsPath, { kind: "web" }), ({ json }) => ({
    requestId: token(textAt(json, "requestId")),
    userCode: textAt(json, "userCode"),
  }));
}

function collectInFirefox(url: string, requestId: Token): Effect.Effect<HttpResponse> {
  return inFirefox(url, collectLoginRequestPath, { kind: "web", requestId });
}

function cookieOf(response: HttpResponse): string {
  const [cookie = NO_COOKIE] = response.headers.getSetCookie();
  return Arr.headNonEmpty(Str.split("; ")(cookie));
}

function loggedInLaptop(cookout: TestCookoutService, ada: TestIdentity): Effect.Effect<CookoutClient> {
  return Effect.gen(function* logInLaptop() {
    const started = yield* answer(() => cookout.clientFor().startLogin({ host: "ada-laptop" }));
    yield* answer(() => ada.client.approveLogin(started.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    if (collected.status === "approved") {
      return cookout.clientFor(collected.token);
    }
    return expect.unreachable("The laptop's login was not approved.");
  });
}

function sessionsIn(json: unknown): readonly unknown[] {
  if (Predicate.hasProperty(json, "sessions") && Arr.isArray(json.sessions)) {
    return json.sessions;
  }
  return expect.unreachable("The answer lists no sessions.");
}

function sessionsBy(url: string, cookie: string): Effect.Effect<readonly unknown[]> {
  return Effect.map(
    answer(() => request({ baseUrl: url, headers: { cookie }, method: "GET", path: sessionsPath })),
    ({ json }) => sessionsIn(json),
  );
}

interface WebLoginSetUp {
  readonly ada: TestIdentity;
  readonly laptop: CookoutClient;
  readonly started: Started;
}

function webRequestBesideLaptop(cookout: TestCookoutService): Effect.Effect<WebLoginSetUp> {
  return Effect.gen(function* setUp() {
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const laptop = yield* loggedInLaptop(cookout, ada);
    const started = yield* startInFirefox(cookout.url);
    return { ada, laptop, started };
  });
}

const notFound = { code: "login_request_not_found", status: NOT_FOUND };

const webSessionUnderTheLaptop = {
  current: true,
  expiresAt: SOME_TEXT,
  id: SOME_TEXT,
  kind: "web",
  lastUsedAt: SOME_TEXT,
  madeAt: SOME_TEXT,
  madeBy: { kind: "cli", where: "ada-laptop" },
  where: "Firefox on macOS",
};

it.effect(
  "a web login request approved from a logged-in session sets a session cookie for that person, under the approving session",
  () =>
    Effect.gen(function* webLogin() {
      const cookout = yield* TestCookout;
      const { ada, laptop, started } = yield* webRequestBesideLaptop(cookout);
      const pending = yield* collectInFirefox(cookout.url, started.requestId);
      yield* answer(() => laptop.approveLogin(started.userCode));
      const collected = yield* collectInFirefox(cookout.url, started.requestId);
      const listed = yield* sessionsBy(cookout.url, cookieOf(collected));

      expect([pending.status, pending.json]).toStrictEqual([ACCEPTED, { status: "pending" }]);
      expect([collected.status, collected.json]).toStrictEqual([OK, { identity: ada.identity, status: "approved" }]);
      expect(cookieOf(collected)).toMatch(new RegExp(`^${sessionCookieName}=cookout_`, "u"));
      expect(listed).toContainEqual(webSessionUnderTheLaptop);
    }).pipe(Effect.provide(testCookout())),
);

function bothApproved(cookout: TestCookoutService): Effect.Effect<readonly [Started, Started, TestIdentity]> {
  return Effect.gen(function* startAndApprove() {
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const web = yield* answer(cookout.clientFor().startWebLogin);
    const cli = yield* answer(() => cookout.clientFor().startLogin({ host: "ada-laptop" }));
    yield* answer(() => ada.client.approveLogin(web.userCode));
    yield* answer(() => ada.client.approveLogin(cli.userCode));
    return [web, cli, ada] as const;
  });
}

it.effect("a web login request collects only as web, and a CLI one only as CLI", () =>
  Effect.gen(function* collectsAsItsKind() {
    const cookout = yield* TestCookout;
    const anonymous = cookout.clientFor();
    const [web, cli, ada] = yield* bothApproved(cookout);
    const webAsCli = yield* refusal(() => anonymous.collectLogin(web.requestId));
    const cliAsWeb = yield* refusal(() => anonymous.collectWebLogin(cli.requestId));
    const webAsWeb = yield* answer(() => anonymous.collectWebLogin(web.requestId));
    const cliAsCli = yield* answer(() => anonymous.collectLogin(cli.requestId));

    expect([webAsCli, cliAsWeb]).toMatchObject([notFound, notFound]);
    expect(webAsWeb).toStrictEqual({ identity: ada.identity, status: "approved" });
    expect(cliAsCli).toMatchObject({ identity: ada.identity, status: "approved", token: SOME_TEXT });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a web login request lasts 10 minutes and is approved by typing its code", () =>
  Effect.gen(function* webStarted() {
    const cookout = yield* TestCookout;
    const started = yield* answer(cookout.clientFor().startWebLogin);

    expect([started.approvalPath, started.expiresAt]).toStrictEqual(["/#/approve", "2026-01-01T00:10:00.000Z"]);
    expect([started.requestId, started.userCode]).toMatchObject([/^cookout_/u, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/u]);
  }).pipe(Effect.provide(testCookout())),
);

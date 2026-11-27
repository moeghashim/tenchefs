import { Array as Arr, Duration, Effect, Option, String as Str } from "effect";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { loginLinkPath, loginLinkWebPath, redeemLoginLinkPath } from "../../../logins/index.ts";
import { token, whoamiPath } from "../../../identities/index.ts";
import type { HttpResponse } from "../../../http/client.ts";
import { TestClock } from "effect/testing";
import { createTestAgent } from "../../../testing/index.ts";
import { request } from "../../../http/client.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const LINK_MINUTES = 15;
const LAST_MINUTE = 1;
const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0";
const NO_COOKIE = "";

function secretOf(link: string): string {
  const [, secret = ""] = Str.split(loginLinkWebPath)(link);
  return secret;
}

function redeemed(url: string, link: string): Effect.Effect<HttpResponse> {
  return answer(() =>
    request({
      baseUrl: url,
      body: { secret: secretOf(link) },
      headers: { "user-agent": FIREFOX_MAC },
      method: "POST",
      path: redeemLoginLinkPath,
    }),
  );
}

function cookieOf(response: HttpResponse): string {
  const [cookie = NO_COOKIE] = response.headers.getSetCookie();
  const [pair] = Str.split("; ")(cookie);
  return pair;
}

function whoamiStatus(url: string, cookie: string): Effect.Effect<number> {
  return Effect.map(
    answer(() => request({ baseUrl: url, headers: { cookie }, method: "GET", path: whoamiPath })),
    ({ status }) => status,
  );
}

function sessionsOf(identity: TestIdentity): Effect.Effect<readonly { kind: string; where: string }[]> {
  return Effect.map(
    answer(() => identity.client.listSessions()),
    ({ sessions }) => Arr.map(sessions, ({ kind, where }) => ({ kind, where })),
  );
}

function cliSessionOf(cookout: TestCookoutService, approver: TestIdentity): Effect.Effect<string> {
  return Effect.gen(function* approvedLogin() {
    const started = yield* answer(() => cookout.clientFor().startLogin({ host: "matt-laptop" }));
    yield* answer(() => approver.client.approveLogin(started.userCode));
    const collected = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    if (collected.status === "approved") {
      return collected.token;
    }
    return expect.unreachable("The login was not approved.");
  });
}

function revokeCurrentOf(session: TestIdentity["client"], owner: TestIdentity): Effect.Effect<void> {
  return Effect.gen(function* revokeCurrent() {
    const { sessions } = yield* answer(() => session.listSessions());
    const current = Option.getOrElse(
      Arr.findFirst(sessions, ({ current: isCurrent }) => isCurrent),
      () => expect.unreachable("The session is not among its own sessions."),
    );
    yield* answer(() => owner.client.revokeSession(current.id));
  });
}

it.effect("an admin's login link logs its person in once, for 15 minutes, and a second redeem finds nothing", () =>
  Effect.gen(function* redeemOnce() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const made = yield* answer(() => cookout.client.createLoginLink("ada"));
    const first = yield* redeemed(cookout.url, made.link);
    const second = yield* refusal(() => cookout.clientFor().redeemLoginLink(token(secretOf(made.link))));
    const [loggedIn, sessions] = yield* Effect.all([whoamiStatus(cookout.url, cookieOf(first)), sessionsOf(ada)], {
      concurrency: 1,
    });

    expect([made.expiresAt, Str.startsWith(`${cookout.url}/#/login-link/cookout_`)(made.link)]).toStrictEqual([
      "2026-01-01T00:15:00.000Z",
      true,
    ]);
    expect([first.status, first.json]).toStrictEqual([OK, { identity: ada.identity }]);
    expect([second, loggedIn]).toMatchObject([{ code: "login_link_not_found", status: NOT_FOUND }, OK]);
    expect(sessions).toStrictEqual([{ kind: "web", where: "Firefox on macOS" }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a login link redeemed at 15 minutes, or never made, finds nothing", () =>
  Effect.gen(function* expired() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const [made, other] = yield* Effect.all(
      [answer(() => cookout.client.createLoginLink("ada")), answer(() => cookout.client.createLoginLink("ada"))],
      { concurrency: 1 },
    );
    const unknown = yield* refusal(() => cookout.clientFor().redeemLoginLink(token("cookout_not-a-link")));
    yield* TestClock.adjust(Duration.minutes(LINK_MINUTES - LAST_MINUTE));
    const inTime = yield* answer(() => cookout.clientFor().redeemLoginLink(token(secretOf(other.link))));
    yield* TestClock.adjust(Duration.minutes(LAST_MINUTE));
    const late = yield* refusal(() => cookout.clientFor().redeemLoginLink(token(secretOf(made.link))));

    expect(inTime.identity.name).toBe("ada");
    expect([unknown, late]).toMatchObject([
      { code: "login_link_not_found", status: NOT_FOUND },
      { code: "login_link_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("only an admin makes a login link, and only for a person", () =>
  Effect.gen(function* refused() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    yield* cookout.createIdentity("bob", { kind: "human" });
    yield* cookout.createIdentity("triage-agent", { kind: "agent", owner: "ada" });
    const byPerson = yield* refusal(() => ada.client.createLoginLink("bob"));
    const forAgent = yield* refusal(() => cookout.client.createLoginLink("triage-agent"));
    const forNobody = yield* refusal(() => cookout.client.createLoginLink("nobody"));
    const forNoName = yield* refusal(() => cookout.client.createLoginLink("Not A Name"));

    expect([byPerson, forAgent, forNobody, forNoName]).toMatchObject([
      { code: "admin_only", status: FORBIDDEN },
      { code: "human_only", status: FORBIDDEN },
      { code: "identity_not_found", status: NOT_FOUND },
      { code: "identity_not_found", status: NOT_FOUND },
    ]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("revoking the admin's session that made a login link ends the session redeemed from it", () =>
  Effect.gen(function* revokeAbove() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const matt = yield* cookout.createIdentity("matt", { admin: true, kind: "human" });
    const laptop = yield* Effect.map(cliSessionOf(cookout, matt), (session) => cookout.clientFor(session));
    const made = yield* answer(() => laptop.createLoginLink("ada"));
    const cookie = yield* Effect.map(redeemed(cookout.url, made.link), cookieOf);
    const before = yield* whoamiStatus(cookout.url, cookie);
    yield* revokeCurrentOf(laptop, matt);
    const after = yield* whoamiStatus(cookout.url, cookie);

    expect([before, after]).toStrictEqual([OK, UNAUTHORIZED]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("creating a person answers a login link that logs them in", () =>
  Effect.gen(function* createdWithLink() {
    const cookout = yield* TestCookout;
    const created = yield* answer(() => cookout.client.createIdentity({ kind: "human", name: "ada" }));
    const { link } = created.loginLink ?? expect.unreachable("Creating a person answered no login link.");
    const response = yield* redeemed(cookout.url, link);
    const loggedIn = yield* whoamiStatus(cookout.url, cookieOf(response));
    const agent = yield* answer(() =>
      createTestAgent({ by: cookout.client, displayName: "Triage", name: "triage-agent", owner: "ada" }),
    );

    expect(response.json).toStrictEqual({ identity: created.identity });
    expect(loggedIn).toBe(OK);
    expect(agent).not.toHaveProperty("loginLink");
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a login link made over HTTPS on Fly links to the board over HTTPS", () =>
  Effect.gen(function* overHttps() {
    const cookout = yield* TestCookout;
    yield* cookout.createIdentity("ada", { kind: "human" });
    const response = yield* answer(() =>
      request({
        baseUrl: cookout.url,
        headers: { authorization: `Bearer ${cookout.adminToken}`, "x-forwarded-proto": "https" },
        method: "POST",
        params: { name: "ada" },
        path: loginLinkPath,
      }),
    );
    const { host } = new URL(cookout.url);
    const overHttpsLink: unknown = expect.stringContaining(`https://${host}/#/login-link/cookout_`);

    expect(response.json).toMatchObject({ link: overHttpsLink });
  }).pipe(Effect.provide(testCookout({ flyAppName: "cookout-test" }))),
);

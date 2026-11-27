import type { CookoutClient, Token } from "../../index.ts";
import { Duration, Effect } from "effect";
import type { LoginCollectedResponse, LoginRequestStartedResponse } from "../../../logins/index.ts";
import { TestCookout, answer, refusal, testCookout } from "../../../testing/server.ts";
import type { TestCookoutService, TestIdentity } from "../../../testing/server.ts";
import { expect, it } from "@effect/vitest";
import { TestClock } from "effect/testing";
import { token } from "../../../identities/index.ts";

const NOT_FOUND = 404;
const FORBIDDEN = 403;
const TOO_MANY = 429;
const LIFETIME_MINUTES = 10;
const THREE = 3;
const SOME_TEXT: unknown = expect.any(String);
const host = { host: "ada-laptop" };

interface Started {
  readonly cookout: TestCookoutService;
  readonly ada: TestIdentity;
  readonly started: LoginRequestStartedResponse;
}

const startedForAda: Effect.Effect<Started, never, TestCookout> = Effect.gen(function* startForAda() {
  const cookout = yield* TestCookout;
  const ada = yield* cookout.createIdentity("ada", { kind: "human" });
  const started = yield* answer(() => cookout.clientFor().startLogin(host));
  return { ada, cookout, started };
});

function approvedLogin({ ada, cookout, started }: Started): Effect.Effect<LoginCollectedResponse> {
  return Effect.gen(function* approveAndCollect() {
    yield* answer(() => ada.client.approveLogin(started.userCode));
    return yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
  });
}

function loggedInClient(started: Started): Effect.Effect<CookoutClient> {
  return Effect.map(approvedLogin(started), (collected) => {
    if (collected.status === "approved") {
      return started.cookout.clientFor(collected.token);
    }
    return expect.unreachable("The login was not approved.");
  });
}

function notFoundThrice(): readonly object[] {
  return Array.from({ length: THREE }, () => ({ code: "login_request_not_found", status: NOT_FOUND }));
}

it.effect("a login request is pending until a human approves it, then gives a credential acting as them", () =>
  Effect.gen(function* approveFlow() {
    const { ada, cookout, started } = yield* startedForAda;
    const pending = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));
    const shown = yield* answer(() => ada.client.getLoginRequest(started.userCode));
    const collected = yield* approvedLogin({ ada, cookout, started });

    expect([started.approvalPath, started.expiresAt]).toStrictEqual(["/#/approve", "2026-01-01T00:10:00.000Z"]);
    expect([started.requestId, started.userCode]).toMatchObject([/^cookout_/u, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/u]);
    expect(pending).toStrictEqual({ status: "pending" });
    expect(shown.loginRequest).toStrictEqual({
      ...host,
      approved: false,
      clientIp: SOME_TEXT,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: started.expiresAt,
      kind: "terminal",
      userCode: started.userCode,
      where: host.host,
    });
    expect(collected).toMatchObject({ identity: ada.identity, status: "approved" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("two Login credentials work beside the identity's token, and logout revokes only its own", () =>
  Effect.gen(function* credentialIsOwn() {
    const first = yield* startedForAda;
    const firstClient = yield* loggedInClient(first);
    const again = yield* answer(() => first.cookout.clientFor().startLogin(host));
    const secondClient = yield* loggedInClient({ ...first, started: again });
    const revoked = yield* answer(firstClient.revokeLogin);
    const afterLogout = yield* refusal(firstClient.whoami);
    const stillIn = yield* Effect.all([answer(secondClient.whoami), answer(first.ada.client.whoami)], {
      concurrency: 1,
    });

    expect(revoked).toStrictEqual({ revoked: true });
    expect(afterLogout).toMatchObject({ code: "token_unknown", status: 401 });
    expect(stillIn).toStrictEqual([{ identity: first.ada.identity }, { identity: first.ada.identity }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("logging out with a token that isn't a Login credential revokes nothing", () =>
  Effect.gen(function* notALogin() {
    const cookout = yield* TestCookout;
    const ada = yield* cookout.createIdentity("ada", { kind: "human" });
    const revoked = yield* answer(ada.client.revokeLogin);
    const stillIn = yield* answer(ada.client.whoami);

    expect([revoked, stillIn]).toStrictEqual([{ revoked: false }, { identity: ada.identity }]);
  }).pipe(Effect.provide(testCookout())),
);

it.effect("a login request is collected once, and never with the user code alone", () =>
  Effect.gen(function* collectOnce() {
    const started = yield* startedForAda;
    yield* approvedLogin(started);
    const anonymous = started.cookout.clientFor();
    const again = yield* refusal(() => anonymous.collectLogin(started.started.requestId));
    const byCode = yield* refusal(() => anonymous.collectLogin(token(started.started.userCode)));
    const wrong = yield* refusal(() => anonymous.collectLogin(token("cookout_not-a-request")));

    expect([again, byCode, wrong]).toMatchObject(notFoundThrice());
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an unapproved login request expires after 10 minutes", () =>
  Effect.gen(function* expires() {
    const { ada, cookout, started } = yield* startedForAda;
    yield* TestClock.adjust(Duration.minutes(LIFETIME_MINUTES));
    const collected = yield* refusal(() => cookout.clientFor().collectLogin(started.requestId));
    const shown = yield* refusal(() => ada.client.getLoginRequest(started.userCode));
    const approved = yield* refusal(() => ada.client.approveLogin(started.userCode));

    expect([collected, shown, approved]).toMatchObject(notFoundThrice());
  }).pipe(Effect.provide(testCookout())),
);

it.effect("an agent can't see or approve a login request", () =>
  Effect.gen(function* agentRefused() {
    const { cookout, started } = yield* startedForAda;
    const bot = yield* cookout.createIdentity("bot");
    const shown = yield* refusal(() => bot.client.getLoginRequest(started.userCode));
    const approved = yield* refusal(() => bot.client.approveLogin(started.userCode));
    const pending = yield* answer(() => cookout.clientFor().collectLogin(started.requestId));

    expect([shown, approved]).toMatchObject([
      { code: "human_only", status: FORBIDDEN },
      { code: "human_only", status: FORBIDDEN },
    ]);
    expect(pending).toStrictEqual({ status: "pending" });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("starting and collecting login requests is rate limited per address", () =>
  Effect.gen(function* rateLimited() {
    const cookout = yield* TestCookout;
    const anonymous = cookout.clientFor();
    const any: Token = token("cookout_any");
    yield* answer(() => anonymous.startLogin(host));
    yield* answer(() => anonymous.startLogin(host));
    const limited = yield* refusal(() => anonymous.collectLogin(any));

    expect(limited).toMatchObject({ code: "rate_limited", status: TOO_MANY });
  }).pipe(Effect.provide(testCookout({ noTokenRequestsPerMinute: 2 }))),
);

it.effect("a login request names a host of 1-100 characters", () =>
  Effect.gen(function* badHost() {
    const cookout = yield* TestCookout;
    const refused = yield* refusal(() => cookout.clientFor().startLogin({ host: "" }));

    expect(refused).toMatchObject({ code: "invalid_request", status: 400 });
  }).pipe(Effect.provide(testCookout())),
);

it.effect("with live secrets, a user code is two groups of four consonants", () =>
  Effect.gen(function* liveCode() {
    const cookout = yield* TestCookout;
    const { userCode } = yield* answer(() => cookout.clientFor().startLogin(host));

    expect(userCode).toMatch(/^[B-DF-HJ-NP-TV-XZ]{4}-[B-DF-HJ-NP-TV-XZ]{4}$/u);
  }).pipe(Effect.provide(testCookout({ secrets: "live" }))),
);
